import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { DEFAULT_PERIODS, type Timetable } from '../lib/timetable'
import { fakeDb, inboxRow, taskRow } from '../test/fakeSupabaseDb'
import { useSupabaseSync } from './useSupabaseSync'

/**
 * 毎週の予定（#279）と時間割の設定の同期を、本物のストアと PostgREST・DB の偽物（`fakeSupabaseDb`）で回す。
 * 回はふつうの予定の行（`tasks`）で、印は `event_series`。もう 1 台の端末・前の版のアプリはサーバーの行を直接書いて真似る
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
const term: Timetable = { periods: [...DEFAULT_PERIODS], termStart: '2026-10-01', termEnd: '2026-11-30', skipHolidays: true }

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

const serverEvents = () => db.tables.tasks!.filter((r) => r.user_id === 'u1' && r.is_event === true)
const liveLocal = () => useTaskStore.getState().tasks.filter((t) => t.kind === 'event' && !t.deletedAt)

describe('毎週の予定の同期（#279）', () => {
  it('時間割から入れた授業は 1 回ずつの予定の行として送られ、どの行にも同じ印が付く。時間割の設定も送る', async () => {
    signIn('u1')
    await untilSynced()
    act(() => {
      useTaskStore.getState().saveTimetable(term)
      useTaskStore.getState().addTimetableClass({ weekday: 1, startTime: '09:00', endTime: '10:30', title: '経済学入門', color: null })
    })
    await afterDebounce()
    // 10/5〜11/30 の月曜（10/12 スポーツの日・11/23 勤労感謝の日を除く）
    const rows = serverEvents()
    expect(rows.map((r) => r.scheduled_date).sort()).toEqual([
      '2026-10-05',
      '2026-10-19',
      '2026-10-26',
      '2026-11-02',
      '2026-11-09',
      '2026-11-16',
      '2026-11-30',
    ])
    const ids = new Set(rows.map((r) => (r.event_series as { id: string }).id))
    expect(ids.size).toBe(1)
    expect(rows[0]!.event_series).toMatchObject({ weekdays: [1], until: '2026-11-30', skipHolidays: true })
    expect(db.tables.user_timetable?.find((r) => r.user_id === 'u1')?.timetable).toMatchObject({ termEnd: '2026-11-30' })
  })

  it('もう 1 台で入れた授業が印ごと届き、前の版のアプリが直した行（印の列を送らない）でも印は残る', async () => {
    const series = { id: 's1', weekdays: [3], until: '2026-10-21', skipHolidays: false }
    const row = (id: string, date: string) =>
      taskRow(id, {
        title: '英語',
        is_event: true,
        scheduled_date: date,
        start_time: '10:40',
        end_time: '12:10',
        event_series: series,
      })
    db.tables.tasks!.push(row('e1', '2026-10-07'), row('e2', '2026-10-14'), row('e3', '2026-10-21'))
    db.tables.user_timetable = [{ user_id: 'u1', timetable: term, updated_at: '2026-10-02T00:00:00.000000+00:00' }]
    signIn('u1')
    await untilSynced()
    expect(liveLocal().map((t) => t.series?.id)).toEqual(['s1', 's1', 's1'])
    expect(useTaskStore.getState().timetable).toEqual(term)

    // 前の版のアプリ: event_series を知らないので、その列には触れずに題名だけ書く
    Object.assign(
      db.tables.tasks!.find((r) => r.id === 'e2')!,
      { title: '英語（教室変更）', updated_at: '2026-10-03T00:10:00.000000+00:00' },
    )
    await pullNow()
    const e2 = useTaskStore.getState().tasks.find((t) => t.id === 'e2')!
    expect(e2.title).toBe('英語（教室変更）')
    expect(e2.series).toEqual(series)
  })

  it('以降すべてを消すとその回から後の行に削除の時刻が付き、もう 1 台にも届く', async () => {
    signIn('u1')
    await untilSynced()
    act(() => {
      useTaskStore.getState().saveTimetable(term)
      useTaskStore.getState().addTimetableClass({ weekday: 1, startTime: '09:00', endTime: '10:30', title: '経済学入門', color: null })
    })
    await afterDebounce()
    const third = liveLocal().sort((a, b) => a.scheduledDate!.localeCompare(b.scheduledDate!))[2]!
    act(() => void useTaskStore.getState().deleteEventSeries(third.id, 'following'))
    await afterDebounce()
    const deleted = serverEvents().filter((r) => r.deleted_at)
    expect(deleted.map((r) => r.scheduled_date).sort()).toEqual(['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16', '2026-11-30'])
    expect(serverEvents().filter((r) => !r.deleted_at)).toHaveLength(2)
  })

  it('以降すべてで直した時刻も、その回から後の行だけに送られる', async () => {
    signIn('u1')
    await untilSynced()
    act(() => {
      useTaskStore.getState().saveTimetable(term)
      useTaskStore.getState().addTimetableClass({ weekday: 1, startTime: '09:00', endTime: '10:30', title: '経済学入門', color: null })
    })
    await afterDebounce()
    const rows = liveLocal().sort((a, b) => a.scheduledDate!.localeCompare(b.scheduledDate!))
    act(() => {
      useTaskStore.getState().setSeriesEditScope(rows[4]!.id, 'following')
      useTaskStore.getState().updateTask(rows[4]!.id, { startTime: '13:00', endTime: '14:30' })
    })
    await afterDebounce()
    const byDate = Object.fromEntries(serverEvents().map((r) => [r.scheduled_date, r.start_time]))
    expect(byDate).toEqual({
      '2026-10-05': '09:00',
      '2026-10-19': '09:00',
      '2026-10-26': '09:00',
      '2026-11-02': '09:00',
      '2026-11-09': '13:00',
      '2026-11-16': '13:00',
      '2026-11-30': '13:00',
    })
  })
})
