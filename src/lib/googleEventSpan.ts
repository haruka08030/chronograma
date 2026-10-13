import { addDays } from 'date-fns'
import type { CalendarEvent } from '../types/calendarEvent'
import { appTimeZone, wallInZone } from './timeZone'
import { intervalSegmentClockOnDay, ymdHmToLocalDate } from './taskTimeRange'
import { toDateKey } from './dateKey'

/** 時刻つきの Google の予定の、アプリのタイムゾーンの壁時計での開始〜終了。終日・時刻なしは null */
export function googleEventInterval(e: CalendarEvent): { start: Date; end: Date } | null {
  if (e.isAllDay || !e.startTime || !e.endTime) return null
  const endWall = wallInZone(new Date(e.end).getTime(), appTimeZone())
  const start = ymdHmToLocalDate(e.date, e.startTime)
  const end = ymdHmToLocalDate(endWall.date, endWall.time)
  return end > start ? { start, end } : null
}

/**
 * 時刻つきの Google の予定がかかる日（`yyyy-MM-dd`）。日をまたぐ予定（22:00〜翌 2:00 など）は重なる日すべて。
 * 0:00 ちょうどに終わる日は含まない
 */
export function googleEventDateKeys(e: CalendarEvent): string[] {
  const iv = googleEventInterval(e)
  if (!iv) return [e.date]
  const keys: string[] = []
  for (let d = ymdHmToLocalDate(e.date, '00:00'); d < iv.end; d = addDays(d, 1)) keys.push(toDateKey(d))
  return keys
}

/** その日の列に描く区間の時刻（始まった日は終わりを '24:00'、次の日からは '00:00' から）。かからなければ null */
export function googleEventSegmentOnDay(e: CalendarEvent, dateKey: string): { startTime: string; endTime: string } | null {
  const iv = googleEventInterval(e)
  return iv ? intervalSegmentClockOnDay(iv, dateKey) : null
}

/** 日をまたぐ予定か（0:00 ちょうどに終わるものは含まない） */
export function googleEventCrossesDay(e: CalendarEvent): boolean {
  return googleEventDateKeys(e).length > 1
}
