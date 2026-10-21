import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { fakeDb, inboxRow, taskRow } from '../test/fakeSupabaseDb'
import { useSupabaseSync } from './useSupabaseSync'

/**
 * 移した予定の控え（#158、`tasks.moved_plans`）の同期を、本物のストアと PostgREST・DB の偽物（`fakeSupabaseDb`）で回す。
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

describe('移した予定の控えの同期（#158）', () => {
  it('今日の予定を明日へ移すと控えが送られ、前の版のアプリが題名だけ直しても、もう 1 台で控えと題名の両方が残る', async () => {
    db.tables.tasks!.push(taskRow('r1', { title: 'レポート', scheduled_date: '2026-10-03', start_time: '13:00', end_time: '14:00' }))
    signIn('u1')
    await untilSynced()
    act(() => useTaskStore.getState().updateTask('r1', { scheduledDate: '2026-10-04' }))
    await afterDebounce()
    const moved = [{ date: '2026-10-03', startTime: '13:00', endTime: '14:00', to: '2026-10-04' }]
    expect(serverRow('r1')).toMatchObject({ scheduled_date: '2026-10-04', moved_plans: moved })

    // 前の版のアプリ: moved_plans を知らないので、その列には触れずに題名だけ書く
    Object.assign(serverRow('r1'), { title: 'レポート（第 2 章）', updated_at: '2026-10-03T09:30:00.000000+00:00' })
    await pullNow()
    expect(local('r1')).toMatchObject({ title: 'レポート（第 2 章）', movedPlans: moved })
  })

  it('手元で予定を移し、同じ行の題名をもう 1 台で直したら、項目ごとに合わせて両方を残す', async () => {
    db.tables.tasks!.push(taskRow('r2', { title: '発表', scheduled_date: '2026-10-02', start_time: '10:00', end_time: '11:00' }))
    signIn('u1')
    await untilSynced()
    // 送る前にもう 1 台が題名を直す
    Object.assign(serverRow('r2'), { title: '発表の準備', updated_at: '2026-10-03T09:00:01.000000+00:00' })
    act(() => useTaskStore.getState().updateTask('r2', { scheduledDate: '2026-10-05' }))
    await afterDebounce()
    await pullNow()
    expect(local('r2')).toMatchObject({
      title: '発表の準備',
      scheduledDate: '2026-10-05',
      movedPlans: [{ date: '2026-10-02', startTime: '10:00', endTime: '11:00', to: '2026-10-05' }],
    })
    expect(serverRow('r2')).toMatchObject({ title: '発表の準備', scheduled_date: '2026-10-05' })
  })

  it('控えの無い To-Do は項目を持たない（同期で「変わった」と見ない）', async () => {
    db.tables.tasks!.push(taskRow('r3', { title: '洗濯', scheduled_date: '2026-10-03' }))
    signIn('u1')
    await untilSynced()
    expect('movedPlans' in local('r3')).toBe(false)
  })
})
