import { describe, expect, it } from 'vitest'
import type { CalendarEvent } from '../types/calendarEvent'
import { appTimeZone, instantFromWall } from './timeZone'
import { googleEventCrossesDay, googleEventDateKeys, googleEventSegmentOnDay } from './googleEventSpan'

/** アプリのタイムゾーンの壁時計で、時刻つきの予定を作る（正規化後の形） */
function timedEvent(date: string, startTime: string, endDate: string, endTime: string): CalendarEvent {
  const tz = appTimeZone()
  return {
    id: 'g1',
    summary: 'Night shift',
    start: new Date(instantFromWall(date, startTime, tz)).toISOString(),
    end: new Date(instantFromWall(endDate, endTime, tz)).toISOString(),
    startTime,
    endTime,
    date,
    isAllDay: false,
  }
}

describe('日をまたぐ Google の予定の区間', () => {
  it('22:00〜翌 2:00 は始まった日が 24:00 まで、翌日が 0:00 から', () => {
    const e = timedEvent('2026-10-06', '22:00', '2026-10-07', '02:00')
    expect(googleEventDateKeys(e)).toEqual(['2026-10-06', '2026-10-07'])
    expect(googleEventSegmentOnDay(e, '2026-10-06')).toEqual({ startTime: '22:00', endTime: '24:00' })
    expect(googleEventSegmentOnDay(e, '2026-10-07')).toEqual({ startTime: '00:00', endTime: '02:00' })
    expect(googleEventSegmentOnDay(e, '2026-10-08')).toBeNull()
    expect(googleEventCrossesDay(e)).toBe(true)
  })

  it('何日も続く 10/5 10:00〜10/7 12:00 は間の日がまる 1 日', () => {
    const e = timedEvent('2026-10-05', '10:00', '2026-10-07', '12:00')
    expect(googleEventDateKeys(e)).toEqual(['2026-10-05', '2026-10-06', '2026-10-07'])
    expect(googleEventSegmentOnDay(e, '2026-10-05')).toEqual({ startTime: '10:00', endTime: '24:00' })
    expect(googleEventSegmentOnDay(e, '2026-10-06')).toEqual({ startTime: '00:00', endTime: '24:00' })
    expect(googleEventSegmentOnDay(e, '2026-10-07')).toEqual({ startTime: '00:00', endTime: '12:00' })
  })

  it('0:00 ちょうどに終わる予定は翌日にかからない', () => {
    const e = timedEvent('2026-10-06', '23:00', '2026-10-07', '00:00')
    expect(googleEventDateKeys(e)).toEqual(['2026-10-06'])
    expect(googleEventSegmentOnDay(e, '2026-10-06')).toEqual({ startTime: '23:00', endTime: '24:00' })
    expect(googleEventCrossesDay(e)).toBe(false)
  })

  it('日をまたがない予定はその日だけ、区間は予定の時刻どおり', () => {
    const e = timedEvent('2026-10-06', '09:00', '2026-10-06', '10:30')
    expect(googleEventDateKeys(e)).toEqual(['2026-10-06'])
    expect(googleEventSegmentOnDay(e, '2026-10-06')).toEqual({ startTime: '09:00', endTime: '10:30' })
  })
})
