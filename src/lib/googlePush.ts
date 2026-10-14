import type { CalendarEvent } from '../types/calendarEvent'
import type { Task } from '../types/task'
import { EVENT_COLOR_BY_ID, NEUTRAL_HEX, nearestGoogleHex } from './googleColors'
import { toGoogleTimes } from './googleCalendar'
import { convertTaskTimes } from './taskTimeZone'
import { appTimeZone, instantFromWall } from './timeZone'

/**
 * アプリの予定（To-Do でない予定）を Google カレンダーにも入れる（片方向）。
 * Google の予定の ID はアプリの予定の ID から決める（`chronograma` ＋ ID の 16 進）。対応表を持たずに、
 * 何度送っても・どの端末から送っても Google には 1 つしかできない。
 * この ID の Google の予定はアプリの予定と同じものなので、Google の予定としては並べない。
 */

const PREFIX = 'chronograma'

export function googleEventIdForTask(taskId: string): string {
  let hex = ''
  for (const byte of new TextEncoder().encode(taskId)) hex += byte.toString(16).padStart(2, '0')
  return PREFIX + hex
}

/** アプリの予定から作った Google の予定（繰り返しの回は `<ID>_<日時>`） */
export function isPushedGoogleEvent(e: Pick<CalendarEvent, 'id'>): boolean {
  return e.id.startsWith(PREFIX)
}

export function withoutPushedEvents(events: CalendarEvent[]): CalendarEvent[] {
  return events.some(isPushedGoogleEvent) ? events.filter((e) => !isPushedGoogleEvent(e)) : events
}

/** Google に置いておく予定か（ゴミ箱・アーカイブ・日の無いものは置かない） */
export function shouldBeOnGoogle(t: Task): boolean {
  return t.kind === 'event' && !t.deletedAt && !t.archivedAt && !!t.scheduledDate
}

/** アプリの色に一番近い Google の予定の色（1〜11）。色なしは null（カレンダーの色） */
export function googleColorIdForHex(hex: string | null | undefined): string | null {
  if (!hex || hex.toUpperCase() === NEUTRAL_HEX) return null
  const near = nearestGoogleHex(hex).toUpperCase()
  return Object.entries(EVENT_COLOR_BY_ID).find(([, h]) => h.toUpperCase() === near)?.[0] ?? null
}

/** Google に送る中身。タイムゾーンを決めた予定は、そのタイムゾーンの予定として送る（Google で開いたときも同じ時刻） */
export function googleFieldsForTask(t: Task): Record<string, unknown> {
  const anchor = t.timeZoneAnchor ?? appTimeZone()
  const zone = t.timeZone && t.startTime && t.endTime ? t.timeZone : anchor
  const times = zone === anchor ? t : convertTaskTimes(t, anchor, zone)
  return {
    summary: t.title,
    description: t.description,
    colorId: googleColorIdForHex(t.color),
    ...toGoogleTimes({
      date: times.scheduledDate!,
      endDate: times.endDate,
      startTime: times.startTime,
      endTime: times.endTime,
      timeZone: zone,
    }),
  }
}

/**
 * Google に関わる中身が変わったかを見るための値。Google に置かないものは 'off'。
 * 時刻は瞬間で比べる（アプリのタイムゾーンを変えて壁時計を書き直しただけでは送り直さない）
 */
export function googleSignature(t: Task | undefined): string {
  if (!t || !shouldBeOnGoogle(t)) return 'off'
  const f = googleFieldsForTask(t)
  const at = (x: { date?: string; dateTime?: string; timeZone?: string }) =>
    x.dateTime ? instantFromWall(x.dateTime.slice(0, 10), x.dateTime.slice(11, 16), x.timeZone!) : x.date
  return JSON.stringify([f.summary, f.description, f.colorId, at(f.start as never), at(f.end as never), t.timeZone])
}

/** 前と今のタスクから、Google に送り直す予定の ID（作る・直す・消す） */
export function changedForGoogle(prev: readonly Task[], next: readonly Task[]): string[] {
  const before = new Map<string, Task>()
  for (const t of prev) if (t.kind === 'event') before.set(t.id, t)
  const ids: string[] = []
  const seen = new Set<string>()
  for (const t of next) {
    seen.add(t.id)
    const p = before.get(t.id)
    if (t.kind !== 'event' && !p) continue
    if (t === p) continue
    if (googleSignature(t) !== googleSignature(p)) ids.push(t.id)
  }
  // 完全に消したもの（ゴミ箱を通っていれば、もう Google には無い）
  for (const [id, p] of before) if (!seen.has(id) && shouldBeOnGoogle(p)) ids.push(id)
  return ids
}
