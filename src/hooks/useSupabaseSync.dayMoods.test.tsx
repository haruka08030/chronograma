import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { fakeDb, inboxRow } from '../test/fakeSupabaseDb'
import { flushPendingSync, useSupabaseSync } from './useSupabaseSync'

/**
 * 1 日の気分（#324）の同期を、本物のストアと PostgREST・DB の偽物（`fakeSupabaseDb`）で回す。
 * もう 1 台の端末はサーバーの `day_moods` の行を直接書いて真似る
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
vi.mock('../lib/webPush', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/webPush')>()),
  detachWebPush: vi.fn(async () => {}),
  resyncWebPush: vi.fn(async () => {}),
}))

let db: ReturnType<typeof fakeDb>

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-03T09:00:00.000Z'))
  localStorage.clear()
  useTaskStore.getState().resetLocalData()
  db = fakeDb()
  db.tables.lists!.push({ ...inboxRow }, { ...inboxRow, user_id: 'u2' })
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

async function afterDebounce() {
  const before = useTaskStore.getState().lastSyncedAt
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2_000)
  })
  await untilSynced(before)
}

/** もう 1 台の端末の変更を取りに行かせる */
async function pollNow() {
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

const moodRow = (userId: string, day: string) => db.tables.day_moods?.find((r) => r.user_id === userId && r.day === day)
const DAY = '2026-10-03'

describe('1 日の気分の同期（#324）', () => {
  it('付けた気分・一言はサーバーに日ごとの行で送られ、変える・外すと送り直す', async () => {
    signIn('u1')
    await untilSynced()
    act(() => useTaskStore.getState().setDayMood(DAY, { mood: 4 }))
    await afterDebounce()
    expect(moodRow('u1', DAY)).toMatchObject({ mood: 4, note: '' })
    // 送れたら手元の時刻ともとにした版はサーバーの版
    expect(useTaskStore.getState().dayMoods[DAY]).toMatchObject({
      updatedAt: moodRow('u1', DAY)!.updated_at,
      syncedAt: moodRow('u1', DAY)!.updated_at,
    })

    act(() => useTaskStore.getState().setDayMood(DAY, { note: 'よく寝た' }))
    await afterDebounce()
    expect(moodRow('u1', DAY)).toMatchObject({ mood: 4, note: 'よく寝た' })

    act(() => useTaskStore.getState().setDayMood(DAY, { mood: null }))
    await afterDebounce()
    // 行は消さず、気分を null にする
    expect(moodRow('u1', DAY)).toMatchObject({ mood: null, note: 'よく寝た' })
    expect(db.tables.day_moods).toHaveLength(1)
  })

  it('ほかの端末で付けた・変えた気分が届く', async () => {
    db.tables.day_moods = [{ user_id: 'u1', day: '2026-10-02', mood: 2, note: '疲れた', updated_at: '2026-10-02T22:00:00.000000+00:00' }]
    signIn('u1')
    await untilSynced()
    expect(useTaskStore.getState().dayMoods['2026-10-02']).toMatchObject({ mood: 2, note: '疲れた' })

    // もう 1 台が同じ日を変え、別の日も付けた（サーバーの時計で今より後）
    db.advance(60_000)
    Object.assign(moodRow('u1', '2026-10-02')!, { mood: 3, updated_at: '2026-10-03T00:01:00.000000+00:00' })
    db.tables.day_moods.push({ user_id: 'u1', day: DAY, mood: 5, note: '', updated_at: '2026-10-03T00:01:00.000001+00:00' })
    await pollNow()
    expect(useTaskStore.getState().dayMoods['2026-10-02']?.mood).toBe(3)
    expect(useTaskStore.getState().dayMoods[DAY]?.mood).toBe(5)
  })

  it('同じ日をほかの端末が先に変えていたら（断られる）、取り直して新しいほうに合わせる', async () => {
    signIn('u1')
    await untilSynced()
    act(() => useTaskStore.getState().setDayMood(DAY, { mood: 2 }))
    await afterDebounce()
    // 送る直前に、もう 1 台が同じ日を変えた（手元の編集より前）
    vi.setSystemTime(new Date('2026-10-03T10:00:00.000Z'))
    act(() => useTaskStore.getState().setDayMood(DAY, { mood: 5 }))
    db.hooks.beforeUpsert = (table) => {
      if (table !== 'day_moods') return
      db.hooks.beforeUpsert = undefined
      Object.assign(moodRow('u1', DAY)!, { mood: 1, updated_at: '2026-10-03T00:00:30.000000+00:00' })
    }
    await afterDebounce()
    // 手元の編集のほうが新しいので、取り直した版をもとに送り直して通る
    expect(moodRow('u1', DAY)?.mood).toBe(5)
    expect(useTaskStore.getState().dayMoods[DAY]?.syncedAt).toBe(moodRow('u1', DAY)?.updated_at)
  })

  it('送れていない気分があれば、ログアウトの前の「送れたか」は false', async () => {
    db.missing.add('day_moods')
    signIn('u1')
    await untilSynced()
    act(() => useTaskStore.getState().setDayMood(DAY, { mood: 3 }))
    let sent = true
    await act(async () => {
      sent = await flushPendingSync()
    })
    expect(sent).toBe(false)
  })

  it('ログアウトせずにアカウントが替わったら、前の人の気分は手元から消え、次の人に送られない', async () => {
    const hook = signIn('u1')
    await untilSynced()
    act(() => useTaskStore.getState().setDayMood(DAY, { mood: 1, note: '内緒' }))
    await afterDebounce()
    expect(moodRow('u1', DAY)?.note).toBe('内緒')

    const before = useTaskStore.getState().lastSyncedAt
    env.user = null
    hook.rerender()
    env.user = { id: 'u2' }
    hook.rerender()
    await untilSynced(before)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })
    expect(useTaskStore.getState().dayMoods).toEqual({})
    expect(moodRow('u2', DAY)).toBeUndefined()
  })
})
