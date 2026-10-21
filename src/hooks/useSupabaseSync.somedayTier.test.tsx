import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { fakeDb, inboxRow, taskRow } from '../test/fakeSupabaseDb'
import { useSupabaseSync } from './useSupabaseSync'

/**
 * いつかの段（#221、`tasks.someday_tier`）の同期を、本物のストアと PostgREST・DB の偽物（`fakeSupabaseDb`）で回す。
 * もう 1 台の端末・前の版のアプリはサーバーの行を直接書いて真似る
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
  backupNow: vi.fn(async () => true),
}))

let db: ReturnType<typeof fakeDb>

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-03T09:00:00.000Z'))
  localStorage.clear()
  useTaskStore.getState().resetLocalData()
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

/** ほかの端末の変更を取りに行く（回線が戻ったときと同じ） */
async function pullNow() {
  const before = useTaskStore.getState().lastSyncedAt
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_000)
    window.dispatchEvent(new Event('online'))
  })
  await untilSynced(before)
}

function signIn(userId: string) {
  env.user = { id: userId }
  return renderHook(() => useSupabaseSync())
}

const serverRow = (id: string) => db.tables.tasks!.find((r) => r.user_id === 'u1' && r.id === id)!
const local = (id: string) => useTaskStore.getState().tasks.find((t) => t.id === id)!

const somedayList = {
  user_id: 'u1',
  id: 'wish',
  name: 'いつか',
  color: '#000000',
  sort_order: 9,
  kind: 'someday',
  updated_at: '2026-10-01T00:00:00.000000+00:00',
}

describe('いつかの段の同期（#221）', () => {
  it('夢へ移すと段が送られ、前の版のアプリが題名だけ直しても段は残る', async () => {
    db.tables.lists!.push({ ...somedayList })
    db.tables.tasks!.push(taskRow('d1', { title: 'マチュピチュに行く', list_id: 'wish' }))
    signIn('u1')
    await untilSynced()
    act(() => useTaskStore.getState().setSomedayTier(['d1'], 'dream'))
    await afterDebounce()
    expect(serverRow('d1')).toMatchObject({ someday_tier: 'dream' })

    // 前の版のアプリ: someday_tier を知らないので、その列には触れずに題名だけ書く
    Object.assign(serverRow('d1'), { title: 'マチュピチュに行く（2027 年）', updated_at: '2026-10-03T09:30:00.000000+00:00' })
    await pullNow()
    expect(local('d1')).toMatchObject({ title: 'マチュピチュに行く（2027 年）', somedayTier: 'dream' })
  })

  it('手元で夢へ移し、同じ行の題名をもう 1 台で直したら、項目ごとに合わせて両方を残す（前回同期でどの行も段を持っていなくても）', async () => {
    db.tables.lists!.push({ ...somedayList })
    db.tables.tasks!.push(taskRow('d2', { title: 'オーロラ', list_id: 'wish' }))
    signIn('u1')
    await untilSynced()
    Object.assign(serverRow('d2'), { title: 'オーロラを見る', updated_at: '2026-10-03T09:00:01.000000+00:00' })
    act(() => useTaskStore.getState().setSomedayTier(['d2'], 'dream'))
    await afterDebounce()
    await pullNow()
    expect(local('d2')).toMatchObject({ title: 'オーロラを見る', somedayTier: 'dream' })
    expect(serverRow('d2')).toMatchObject({ title: 'オーロラを見る', someday_tier: 'dream' })
  })

  it('やりたいの行は項目を持たない', async () => {
    db.tables.lists!.push({ ...somedayList })
    db.tables.tasks!.push(taskRow('w1', { title: 'ピクニック', list_id: 'wish', someday_tier: null }))
    signIn('u1')
    await untilSynced()
    expect('somedayTier' in local('w1')).toBe(false)
  })
})
