import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { refreshAppClock } from '../lib/appClock'
import { useTaskStore } from '../store/taskStore'
import type { CalendarEvent } from '../types/calendarEvent'
import { appTimeZone, instantFromWall } from '../lib/timeZone'
import { fromDateKey } from '../lib/dateKey'
import { useWeekBuckets } from './useWeekBuckets'

function timedEvent(id: string, date: string, startTime: string, endDate: string, endTime: string): CalendarEvent {
  const tz = appTimeZone()
  return {
    id,
    summary: id,
    start: new Date(instantFromWall(date, startTime, tz)).toISOString(),
    end: new Date(instantFromWall(endDate, endTime, tz)).toISOString(),
    startTime,
    endTime,
    date,
    isAllDay: false,
  }
}

const days = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'].map(fromDateKey)

describe('useWeekBuckets: 日をまたぐ Google の予定', () => {
  it('22:00〜翌 2:00 はタイムラインの両方の日に入る（一覧用の eventsByDate は始まった日のまま）', () => {
    const e = timedEvent('night', '2026-10-06', '22:00', '2026-10-07', '02:00')
    const { result } = renderHook(() => useWeekBuckets([], [], [e], days))
    expect(result.current.timedEventsByDate.get('2026-10-06')).toEqual([e])
    expect(result.current.timedEventsByDate.get('2026-10-07')).toEqual([e])
    expect(result.current.timedEventsByDate.get('2026-10-08')).toBeUndefined()
    expect(result.current.eventsByDate.get('2026-10-07')).toBeUndefined()
  })

  it('10/5 10:00〜10/7 12:00 は 3 日すべてに入る', () => {
    const e = timedEvent('trip', '2026-10-05', '10:00', '2026-10-07', '12:00')
    const { result } = renderHook(() => useWeekBuckets([], [], [e], days))
    for (const dk of ['2026-10-05', '2026-10-06', '2026-10-07']) expect(result.current.timedEventsByDate.get(dk)).toEqual([e])
  })

  it('終日の予定はタイムラインの列には入れない', () => {
    const allDay: CalendarEvent = {
      ...timedEvent('a', '2026-10-06', '00:00', '2026-10-07', '00:00'),
      isAllDay: true,
      startTime: null,
      endTime: null,
    }
    const { result } = renderHook(() => useWeekBuckets([], [], [allDay], days))
    expect(result.current.timedEventsByDate.size).toBe(0)
    expect(result.current.eventsByDate.get('2026-10-06')).toEqual([allDay])
  })
})

describe('useWeekBuckets: 開いたまま 0 時をまたぐ', () => {
  afterEach(() => {
    vi.useRealTimers()
    refreshAppClock()
  })

  it('移した予定の控えは、昨日になった日にタスクが変わらなくても出る', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 6, 23, 58))
    refreshAppClock()
    // 今日（10/6）の 9:00–10:00 の予定を、夜に明日へ移した（元の予定は控えに残る）
    const id = useTaskStore.getState().addTask('Report')!
    useTaskStore.getState().updateTask(id, { scheduledDate: '2026-10-06', startTime: '09:00', endTime: '10:00' })
    useTaskStore.getState().updateTask(id, { scheduledDate: '2026-10-07', startTime: '10:00', endTime: '11:00' })
    const tasks = useTaskStore.getState().tasks
    const { result } = renderHook(() => useWeekBuckets(tasks, [], [], days))
    // 10/6 はまだ今日なので控えは出さない
    expect(result.current.movedByDate.get('2026-10-06')).toBeUndefined()

    vi.setSystemTime(new Date(2026, 9, 7, 0, 2))
    act(() => refreshAppClock())
    expect(result.current.movedByDate.get('2026-10-06')?.map((t) => t.id)).toEqual([id])
  })
})
