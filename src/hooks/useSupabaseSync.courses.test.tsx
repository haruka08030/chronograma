import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { fakeDb, inboxRow } from '../test/fakeSupabaseDb'
import { useSupabaseSync } from './useSupabaseSync'

/**
 * 授業の予定と科目のつながり（#309）の同期を、本物のストアと PostgREST・DB の偽物（`fakeSupabaseDb`）で回す。
 * もう 1 台の端末はサーバーの `user_course_links` の行を直接書いて真似る
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

function signIn(userId: string) {
  env.user = { id: userId }
  return renderHook(() => useSupabaseSync())
}

const linkRow = () => db.tables.user_course_links?.find((r) => r.user_id === 'u1')

describe('授業と科目のつながりの同期（#309）', () => {
  it('この端末で選んだつながりはサーバーに送られ、選び直したら送り直す', async () => {
    signIn('u1')
    await untilSynced()
    act(() => useTaskStore.getState().setCourseLink('プログラミング基礎', 'CSE-101'))
    await afterDebounce()
    expect(linkRow()?.links).toEqual([{ title: 'プログラミング基礎', course: 'CSE-101' }])
    expect(useTaskStore.getState().courseLinksUpdatedAt).toBe(linkRow()?.updated_at)

    act(() => useTaskStore.getState().setCourseLink('プログラミング基礎', ''))
    await afterDebounce()
    expect(linkRow()?.links).toEqual([{ title: 'プログラミング基礎', course: '' }])
  })

  it('ほかの端末で選んだつながりが届く（初めて合わせるときは手元にしか無いものも残す）', async () => {
    db.tables.user_course_links = [
      { user_id: 'u1', links: [{ title: '英語', course: 'ENG-1' }], updated_at: '2026-10-02T00:00:00.000000+00:00' },
    ]
    act(() => useTaskStore.getState().setCourseLink('経済', 'ECON-1'))
    signIn('u1')
    await untilSynced()
    const both = [
      { title: '英語', course: 'ENG-1' },
      { title: '経済', course: 'ECON-1' },
    ]
    expect(useTaskStore.getState().courseLinks).toEqual(both)
    expect(linkRow()?.links).toEqual(both)

    // もう 1 台が「英語」をつながないにした
    Object.assign(linkRow()!, { links: [{ title: '英語', course: '' }], updated_at: '2026-10-03T00:10:00.000000+00:00' })
    const before = useTaskStore.getState().lastSyncedAt
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
      window.dispatchEvent(new Event('online'))
    })
    await untilSynced(before)
    expect(useTaskStore.getState().courseLinks).toEqual([{ title: '英語', course: '' }])
  })
})
