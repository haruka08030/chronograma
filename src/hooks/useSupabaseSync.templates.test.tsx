import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { fakeDb, inboxRow } from '../test/fakeSupabaseDb'
import type { EventTemplate } from '../lib/eventTemplates'
import { useSupabaseSync } from './useSupabaseSync'

/**
 * よく入れる予定（#311）の同期を、本物のストアと PostgREST・DB の偽物（`fakeSupabaseDb`）で回す。
 * もう 1 台の端末はサーバーの `user_event_templates` の行を直接書いて真似る
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

const late: EventTemplate = { id: 'late', title: 'バイト 遅番', startTime: '17:00', endTime: '22:00', color: '#039BE5' }
const early: EventTemplate = { id: 'early', title: 'バイト 早番', startTime: '09:00', endTime: '15:00', color: null }

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

const templateRow = () => db.tables.user_event_templates?.find((r) => r.user_id === 'u1')

describe('よく入れる予定の同期（#311）', () => {
  it('この端末で登録したものはサーバーに送られ、直したら送り直す', async () => {
    signIn('u1')
    await untilSynced()
    act(() => useTaskStore.getState().saveEventTemplates([late]))
    await afterDebounce()
    expect(templateRow()?.templates).toEqual([late])
    // 送れたら手元の時刻はサーバーの版になる
    expect(useTaskStore.getState().eventTemplatesUpdatedAt).toBe(templateRow()?.updated_at)

    act(() => useTaskStore.getState().saveEventTemplates([{ ...late, endTime: '23:00' }, early]))
    await afterDebounce()
    expect(templateRow()?.templates).toEqual([{ ...late, endTime: '23:00' }, early])
  })

  it('ほかの端末で登録したものが届く（初めて合わせるときは手元にしか無いものも残す）', async () => {
    db.tables.user_event_templates = [{ user_id: 'u1', templates: [late], updated_at: '2026-10-02T00:00:00.000000+00:00' }]
    act(() => useTaskStore.getState().saveEventTemplates([early]))
    signIn('u1')
    await untilSynced()
    expect(useTaskStore.getState().eventTemplates).toEqual([late, early])
    expect(templateRow()?.templates).toEqual([late, early])

    // もう 1 台が「遅番」を消した
    Object.assign(templateRow()!, { templates: [early], updated_at: '2026-10-03T00:10:00.000000+00:00' })
    const before = useTaskStore.getState().lastSyncedAt
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
      window.dispatchEvent(new Event('online'))
    })
    await untilSynced(before)
    expect(useTaskStore.getState().eventTemplates).toEqual([early])
  })

  it('日を押して入れた予定は、ふつうの予定としてサーバーに入る', async () => {
    signIn('u1')
    await untilSynced()
    act(() => {
      const s = useTaskStore.getState()
      s.saveEventTemplates([late])
      for (const d of ['2026-10-05', '2026-10-07']) s.asUndoSession('s1', () => s.toggleEventTemplateDay('late', d))
    })
    await afterDebounce()
    const rows = db.tables.tasks!.filter((r) => r.user_id === 'u1' && r.is_event)
    expect(rows.map((r) => r.scheduled_date).sort()).toEqual(['2026-10-05', '2026-10-07'])
    expect(rows.every((r) => r.title === 'バイト 遅番' && r.start_time === '17:00' && r.end_time === '22:00')).toBe(true)
  })
})
