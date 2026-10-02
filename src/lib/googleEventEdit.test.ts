import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CalendarEvent } from '../types/calendarEvent'

/** 画面の状態の代わり（予定の一覧と「元に戻す」のトーストだけ） */
const store = vi.hoisted(() => {
  const s = {
    calendarEvents: [] as CalendarEvent[],
    googleUndo: null as { id: string; text: string; at: number } | null,
    setCalendarEvents: (events: CalendarEvent[]) => { s.calendarEvents = events },
    setGoogleUndo: (next: { id: string; text: string } | null) => { s.googleUndo = next ? { ...next, at: 0 } : null },
    showMoveBanner: vi.fn(),
    setGoogleCanWrite: vi.fn(),
  }
  return s
})
const deleteGoogleEvent = vi.hoisted(() => vi.fn(async () => {}))

vi.mock('../store/taskStore', () => ({ useTaskStore: { getState: () => store } }))
vi.mock('../i18n/config', () => ({ default: { t: (k: string) => k } }))
vi.mock('./useTimelineDrop', () => ({ GOOGLE_EVENT_DND_TYPE: 'x' }))
vi.mock('./googleCalendar', () => ({
  deleteGoogleEvent,
  applyTimingLocally: vi.fn(),
  createGoogleEvent: vi.fn(),
  updateGoogleEvent: vi.fn(),
  localizeGoogleError: (raw: string) => raw,
}))

const { removeGoogleEvent, undoGoogleDelete, withoutPendingDeletes } = await import('./googleEventEdit')
const { UNDO_WINDOW_MS } = await import('./undoWindow')

const event = (id: string): CalendarEvent =>
  ({ id, summary: id, start: '', end: '', startTime: null, endTime: null, date: '2026-10-02', isAllDay: false, editable: true }) as CalendarEvent

describe('Google の予定の削除（「元に戻す」の間は Google に送らない）', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    deleteGoogleEvent.mockClear()
    store.calendarEvents = [event('a'), event('b')]
    store.googleUndo = null
  })
  afterEach(() => vi.useRealTimers())

  it('画面からはすぐ消え、トーストが消えてから Google に送る', async () => {
    removeGoogleEvent(event('a'))
    expect(store.calendarEvents.map((e) => e.id)).toEqual(['b'])
    expect(store.googleUndo?.id).toBe('a')
    expect(deleteGoogleEvent).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS)
    expect(deleteGoogleEvent).toHaveBeenCalledWith('a')
    expect(store.googleUndo).toBeNull()
  })

  it('元に戻すと予定が戻り、Google には送らない', async () => {
    removeGoogleEvent(event('a'))
    expect(undoGoogleDelete()).toBe(true)
    expect(store.calendarEvents.map((e) => e.id).sort()).toEqual(['a', 'b'])
    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS)
    expect(deleteGoogleEvent).not.toHaveBeenCalled()
  })

  it('送る前に取り直しても、消した予定を生き返らせない', async () => {
    removeGoogleEvent(event('a'))
    expect(withoutPendingDeletes([event('a'), event('b')]).map((e) => e.id)).toEqual(['b'])
    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS)
  })

  it('Google への削除に失敗したら予定を戻して知らせる', async () => {
    deleteGoogleEvent.mockRejectedValueOnce(new Error('boom'))
    removeGoogleEvent(event('a'))
    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS)
    expect(store.calendarEvents.map((e) => e.id).sort()).toEqual(['a', 'b'])
    expect(store.showMoveBanner).toHaveBeenCalled()
  })
})
