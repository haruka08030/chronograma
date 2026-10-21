import type { CalendarEvent } from '../types/calendarEvent'
import type { Task } from '../types/task'
import { EVENT_COLOR_BY_ID, NEUTRAL_HEX, nearestGoogleHex } from './googleColors'
import { toGoogleTimes } from './googleCalendar'
import { convertTaskTimes } from './taskTimeZone'
import { appTimeZone, instantFromWall } from './timeZone'
import { googleSkipKey } from './googleSkip'

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

/** Google の予定の ID からアプリの予定の ID（アプリの予定から作ったものでなければ null） */
export function taskIdForGoogleEventId(eventId: string): string | null {
  const hex = eventId.slice(PREFIX.length)
  if (!eventId.startsWith(PREFIX) || hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-f]+$/.test(hex)) return null
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

/** アプリの予定から作った Google の予定（繰り返しの回は `<ID>_<日時>`） */
export function isPushedGoogleEvent(e: Pick<CalendarEvent, 'id'>): boolean {
  return e.id.startsWith(PREFIX)
}

export function withoutPushedEvents(events: CalendarEvent[]): CalendarEvent[] {
  return events.some(isPushedGoogleEvent) ? events.filter((e) => !isPushedGoogleEvent(e)) : events
}

/** 送らない名前（`googleSkipKeys` の形）。無ければ空 */
type SkipKeys = ReadonlySet<string>
const NO_SKIP: SkipKeys = new Set()

/** Google に置いておく予定か（ゴミ箱・アーカイブ・日の無いもの・送らない名前のものは置かない） */
export function shouldBeOnGoogle(t: Task, skip: SkipKeys = NO_SKIP): boolean {
  return t.kind === 'event' && !t.deletedAt && !t.archivedAt && !!t.scheduledDate && !skip.has(googleSkipKey(t.title))
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
export function googleSignature(t: Task | undefined, skip: SkipKeys = NO_SKIP): string {
  if (!t || !shouldBeOnGoogle(t, skip)) return 'off'
  const f = googleFieldsForTask(t)
  const at = (x: { date?: string; dateTime?: string; timeZone?: string }) =>
    x.dateTime ? instantFromWall(x.dateTime.slice(0, 10), x.dateTime.slice(11, 16), x.timeZone!) : x.date
  return JSON.stringify([f.summary, f.description, f.colorId, at(f.start as never), at(f.end as never), t.timeZone])
}

/** 前と今のタスクから、Google に送り直す予定の ID（作る・直す・消す） */
export function changedForGoogle(prev: readonly Task[], next: readonly Task[], skip: SkipKeys = NO_SKIP): string[] {
  const before = new Map<string, Task>()
  for (const t of prev) if (t.kind === 'event') before.set(t.id, t)
  const ids: string[] = []
  const seen = new Set<string>()
  for (const t of next) {
    seen.add(t.id)
    const p = before.get(t.id)
    if (t.kind !== 'event' && !p) continue
    if (t === p) continue
    if (googleSignature(t, skip) !== googleSignature(p, skip)) ids.push(t.id)
  }
  // 完全に消したもの（ゴミ箱を通っていれば、もう Google には無い）
  for (const [id, p] of before) if (!seen.has(id) && shouldBeOnGoogle(p, skip)) ids.push(id)
  return ids
}

/**
 * 送らない名前を変えたときに送り直す予定の ID。送らないにした名前の予定は Google から消す（日を問わない）。
 * 送るに戻した名前の予定は今日から先のものだけ送る（過ぎた予定まで Google に足さない）
 */
export function changedForGoogleSkip(tasks: readonly Task[], prev: SkipKeys, next: SkipKeys, todayKey: string): string[] {
  const ids: string[] = []
  for (const t of tasks) {
    if (t.kind !== 'event' || t.deletedAt) continue
    const key = googleSkipKey(t.title)
    if (prev.has(key) === next.has(key)) continue
    if (next.has(key) || (t.endDate ?? t.scheduledDate ?? '') >= todayKey) ids.push(t.id)
  }
  return ids
}
