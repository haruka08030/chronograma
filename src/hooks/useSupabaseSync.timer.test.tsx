import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { timerRecordTimes } from '../lib/timerRecord'
import { fakeDb, inboxRow } from '../test/fakeSupabaseDb'
import { useSupabaseSync } from './useSupabaseSync'

/**
 * 動いているタイマーの同期（#301）を、本物のストアと PostgREST・DB の偽物（`fakeSupabaseDb`）で回す。
 * もう 1 台の端末はサーバーの `user_active_timer` の行を直接書いて真似る
 */
const env = vi.hoisted(() => ({
  client: null as unknown,
  user: null as { id: string } | null,
}))

vi.mock('../lib/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/supabase')>()),
  getSupabase: () => env.client,
}))
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: env.user, loading: false }),
}))
vi.mock('../lib/errorReport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/errorReport')>()),
  reportSyncError: vi.fn(),
}))
vi.mock('./useAutoBackup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./useAutoBackup')>()),
  backupNow: vi.fn(),
}))

let db: ReturnType<typeof fakeDb>

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-03T09:00:00.000Z'))
  db = fakeDb()
  db.tables.lists!.push({ ...inboxRow })
  env.client = db.client
  env.user = null
})

afterEach(() => {
  vi.useRealTimers()
})

async function untilSynced(before = useTaskStore.getState().lastSyncedAt) {
  for (let i = 0; i < 200; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    const s = useTaskStore.getState()
    if (s.lastSyncedAt !== before && s.syncState === 'idle') return
  }
  throw new Error(`sync did not finish (state: ${useTaskStore.getState().syncState})`)
}

/** 待ち時間（1.8 秒）の後の同期が終わるまで */
async function afterDebounce() {
  const before = useTaskStore.getState().lastSyncedAt
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2_000)
  })
  await untilSynced(before)
}

function signIn(userId: string) {
  env.user = { id: userId }
  return renderHook(() => useSupabaseSync())
}

const timerRow = () => db.tables.user_active_timer?.find((r) => r.user_id === 'u1')
const serverLogs = () => db.tables.tasks!.filter((r) => r.user_id === 'u1' && r.is_time_log).map((r) => String(r.title))

describe('動いているタイマーの同期（#301）', () => {
  it('ほかの端末で始めたタイマーが出て、ここで止めると記録が 1 本でき、サーバーのタイマーも止まる', async () => {
    db.tables.user_active_timer = [
      {
        user_id: 'u1',
        started_at: '2026-10-03T08:30:00+00:00',
        task_title: 'ES',
        tags: ['就活'],
        task_id: null,
        color: null,
        updated_at: '2026-10-02T00:00:00.000000+00:00',
      },
    ]
    signIn('u1')
    await untilSynced()
    expect(useTaskStore.getState().activeTimer).toEqual({
      taskTitle: 'ES',
      startedAt: '2026-10-03T08:30:00.000Z',
      tags: ['就活'],
      taskId: null,
      color: null,
    })

    act(() => useTaskStore.getState().stopTimer())
    await afterDebounce()

    expect(useTaskStore.getState().activeTimer).toBeNull()
    expect(timerRow()).toMatchObject({ started_at: null, task_title: null })
    expect(serverLogs()).toEqual(['ES'])
  })

  it('ほかの端末で止められたら、ここのタイマーは記録を作らずに消える', async () => {
    signIn('u1')
    await untilSynced()
    act(() => useTaskStore.getState().startTimer('ES'))
    await afterDebounce()
    expect(timerRow()).toMatchObject({ task_title: 'ES' })

    // もう 1 台が止めた（記録はその端末が作って送る）
    Object.assign(timerRow()!, { started_at: null, task_title: null, updated_at: '2026-10-03T00:10:00.000000+00:00' })
    // 次の同期（回線が戻った・画面に戻った・60 秒ごと）
    const before = useTaskStore.getState().lastSyncedAt
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
      window.dispatchEvent(new Event('online'))
    })
    await untilSynced(before)

    expect(useTaskStore.getState().activeTimer).toBeNull()
    expect(useTaskStore.getState().tasks.filter((t) => t.kind === 'log')).toEqual([])
  })

  it('ほかの端末で動いているのを知らずに ▶ を押したら、そのタイマーを記録にして切り替え、知らせる', async () => {
    signIn('u1')
    await untilSynced()
    // もう 1 台が 08:40 に始めた（この端末はまだ取り込んでいない）
    Object.assign(timerRow()!, {
      started_at: '2026-10-03T08:40:00+00:00',
      task_title: 'ES',
      updated_at: '2026-10-03T00:10:00.000000+00:00',
    })

    act(() => useTaskStore.getState().startTimer('英語'))
    await afterDebounce()
    // 記録を足したので、もう 1 回送る
    await afterDebounce()

    const s = useTaskStore.getState()
    expect(s.activeTimer?.taskTitle).toBe('英語')
    expect(timerRow()).toMatchObject({ task_title: '英語' })
    const log = s.tasks.find((t) => t.kind === 'log')
    expect(log).toMatchObject({ title: 'ES', ...timerRecordTimes('2026-10-03T08:40:00.000Z', s.activeTimer!.startedAt) })
    expect(serverLogs()).toEqual(['ES'])
    expect(s.moveBannerText).toMatchObject({ key: 'quickLog.switched', params: { title: 'ES' } })
  })
})
