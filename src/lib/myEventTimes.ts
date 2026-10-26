import type { CalendarEvent } from '../types/calendarEvent'
import { appTimeZone, wallInZone } from './timeZone'

/**
 * Google の予定の「自分の時間」（#625）。説明会に途中から行く・早めに抜けるなど、自分が出る時間をアプリだけに持つ。
 * Google の予定の時間はアプリから書き換えない（Google にある時間が開催時間）。
 *
 * - アプリで時刻つきの Google の予定を動かす・伸び縮みさせる・カードで時刻を変えると、その予定の ID（繰り返しは回ごとの ID）に自分の時間を持つ
 * - 画面・空き時間・今と次の予定・記録へのコピーなど、自分の予定として使うところはどこも自分の時間（`withMyEventTimes` をストアの
 *   `calendarEvents` に当てる。開催時間は予定の `held` に残す）
 * - Google で開催時間が変わったら（持っている開催時間の控えと違ったら）、はみ出した側だけ新しい開催時間に合わせて削る。
 *   重ならなくなったら自分の時間を外す（`fitMyTime`）
 * - 端末間で同期する（`user_my_event_times`、`049`）。外したものは同期で戻らないよう、外した印（`removed`）を少しの間持つ
 */

/** 覚えておける数（DB の大きさの上限に収まる数）。超えたら日付の古いものから落とす */
export const MY_EVENT_TIMES_MAX = 500
/** 終わってからこれより古い自分の時間は持たない */
const KEEP_MS = 180 * 24 * 60 * 60 * 1000
/** 外した印を持っておく長さ（ほかの端末と合わせるまで十分な長さ） */
const REMOVED_KEEP_MS = 30 * 24 * 60 * 60 * 1000

export type MyEventTime = {
  /** Google の予定の ID */
  id: string
  /** 自分の時間（ISO の時刻） */
  start: string
  end: string
  /** 自分の時間を決めたとき（と最後に合わせたとき）の開催時間（Google の start / end） */
  heldStart: string
  heldEnd: string
  /** この項目を変えた時刻（同期で項目ごとに新しいほうを取る） */
  updatedAt: string
  /** 開催時間に戻した印 */
  removed?: true
}

export type TimeSpan = { start: string; end: string }

const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const ms = (iso: string) => Date.parse(iso)
const validIso = (v: unknown): v is string => str(v) && Number.isFinite(ms(v))
const sameSpan = (a: TimeSpan, b: TimeSpan) => ms(a.start) === ms(b.start) && ms(a.end) === ms(b.end)

/**
 * 開催時間に合わせた自分の時間。収まっていればそのまま、はみ出した側だけ開催時間に削る。重ならなければ null
 * （例: 自分 13:30–15:00・開催 13:00–14:30 → 13:30–14:30）
 */
export function fitMyTime(mine: TimeSpan, held: TimeSpan): TimeSpan | null {
  const start = Math.max(ms(mine.start), ms(held.start))
  const end = Math.min(ms(mine.end), ms(held.end))
  if (!(start < end)) return null
  return {
    start: start === ms(mine.start) ? mine.start : held.start,
    end: end === ms(mine.end) ? mine.end : held.end,
  }
}

/** 保存・同期から読んだ値をそろえる。同じ予定は先のもの */
export function normalizeMyEventTimes(raw: unknown): MyEventTime[] {
  if (!Array.isArray(raw)) return []
  const out: MyEventTime[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    const x = item as Record<string, unknown> | null
    if (!x || !str(x.id) || seen.has(x.id)) continue
    if (!validIso(x.start) || !validIso(x.end) || !validIso(x.heldStart) || !validIso(x.heldEnd) || !validIso(x.updatedAt)) continue
    if (!(ms(x.start) < ms(x.end))) continue
    seen.add(x.id)
    out.push({
      id: x.id,
      start: x.start,
      end: x.end,
      heldStart: x.heldStart,
      heldEnd: x.heldEnd,
      updatedAt: x.updatedAt,
      ...(x.removed === true ? { removed: true as const } : {}),
    })
  }
  return cleanMyEventTimes(out)
}

/** 開始の新しい順・上限まで（同じ並びなら同期で違って見えない） */
export function cleanMyEventTimes(list: readonly MyEventTime[]): MyEventTime[] {
  return [...list].sort((a, b) => ms(b.start) - ms(a.start) || a.id.localeCompare(b.id)).slice(0, MY_EVENT_TIMES_MAX)
}

/** 古い自分の時間と、外してしばらくたった印を落とす。変わらなければ同じ並び */
function withoutStale(list: readonly MyEventTime[], now: number): MyEventTime[] {
  const kept = list.filter((e) =>
    e.removed ? now - ms(e.updatedAt) <= REMOVED_KEEP_MS : now - Math.max(ms(e.end), ms(e.heldEnd)) <= KEEP_MS,
  )
  return kept.length === list.length ? (list as MyEventTime[]) : kept
}

/** 予定の開催時間（自分の時間を当てた予定でも Google にある時間） */
export function heldSpan(e: Pick<CalendarEvent, 'start' | 'end' | 'held'>): TimeSpan {
  return e.held ?? { start: e.start, end: e.end }
}

/**
 * 予定に自分の時間を付ける。開催時間と同じなら外す（外した印にする）。変わらなければ同じ並び
 */
export function withMyTime(
  list: readonly MyEventTime[],
  event: Pick<CalendarEvent, 'id' | 'start' | 'end' | 'held'>,
  mine: TimeSpan,
  nowIso = new Date().toISOString(),
): MyEventTime[] {
  const held = heldSpan(event)
  const cur = list.find((e) => e.id === event.id)
  const active = cur && !cur.removed ? cur : null
  if (sameSpan(mine, held)) return active ? withRemovedTime(withoutStale(list, ms(nowIso)), event.id, nowIso) : (list as MyEventTime[])
  if (!(ms(mine.start) < ms(mine.end))) return list as MyEventTime[]
  if (active && sameSpan(active, mine) && sameSpan({ start: active.heldStart, end: active.heldEnd }, held)) return list as MyEventTime[]
  const kept = withoutStale(list, ms(nowIso))
  const entry: MyEventTime = { id: event.id, start: mine.start, end: mine.end, heldStart: held.start, heldEnd: held.end, updatedAt: nowIso }
  return cleanMyEventTimes([...kept.filter((e) => e.id !== event.id), entry])
}

/** 自分の時間を外す（開催時間に戻す）。外した印を残す。持っていなければ同じ並び */
export function withRemovedTime(list: readonly MyEventTime[], id: string, nowIso = new Date().toISOString()): MyEventTime[] {
  if (!list.some((e) => e.id === id && !e.removed)) return list as MyEventTime[]
  return list.map((e) => (e.id === id ? { ...e, removed: true as const, updatedAt: nowIso } : e))
}

/**
 * Google から取った予定に合わせる。開催時間が控えと違う予定は `fitMyTime` で削り（重ならなければ・開催時間と同じになったら外す）、
 * 控えを新しい開催時間にする。終日になった予定は外す。変わらなければ同じ並び
 */
export function fitMyEventTimes(
  list: readonly MyEventTime[],
  events: readonly Pick<CalendarEvent, 'id' | 'start' | 'end' | 'isAllDay'>[],
  nowIso = new Date().toISOString(),
): MyEventTime[] {
  if (list.length === 0) return list as MyEventTime[]
  const byId = new Map(events.map((e) => [e.id, e]))
  let changed = false
  const next = list.map((entry) => {
    const ev = byId.get(entry.id)
    if (entry.removed || !ev) return entry
    const held = { start: ev.start, end: ev.end }
    if (!ev.isAllDay && sameSpan({ start: entry.heldStart, end: entry.heldEnd }, held)) return entry
    changed = true
    const fitted = ev.isAllDay ? null : fitMyTime(entry, held)
    if (!fitted || sameSpan(fitted, held)) return { ...entry, removed: true as const, updatedAt: nowIso }
    return { ...entry, ...fitted, heldStart: held.start, heldEnd: held.end, updatedAt: nowIso }
  })
  return changed ? cleanMyEventTimes(next) : (list as MyEventTime[])
}

/** 自分の時間を当てる前の、Google にある時間の予定 */
function heldEvent(e: CalendarEvent): CalendarEvent {
  if (!e.held) return e
  const out = withTimes(e, e.held)
  delete out.held
  return out
}

function withTimes(e: CalendarEvent, span: TimeSpan): CalendarEvent {
  const tz = appTimeZone()
  const start = wallInZone(ms(span.start), tz)
  const end = wallInZone(ms(span.end), tz)
  return { ...e, start: span.start, end: span.end, date: start.date, startTime: start.time, endTime: end.time }
}

/**
 * 予定に自分の時間を当てる（ストアの `calendarEvents` に入れるときに 1 か所で、`slices/google.ts`）。
 * 開催時間は `held` に残す。何度当てても同じ（当てた予定は開催時間に戻してから当て直す）。
 * Google で開催時間が変わってまだ控えを合わせていなくても、ここで削った時間で出す。変わらなければ同じ並び
 */
export function withMyEventTimes(events: readonly CalendarEvent[], list: readonly MyEventTime[]): CalendarEvent[] {
  const byId = new Map<string, MyEventTime>()
  for (const e of list) if (!e.removed) byId.set(e.id, e)
  let changed = false
  const out = events.map((e) => {
    const entry = byId.get(e.id)
    if (!entry && !e.held) return e
    const base = heldEvent(e)
    let next = base
    if (entry && !base.isAllDay && !base.skipped) {
      const held = { start: base.start, end: base.end }
      const mine = sameSpan({ start: entry.heldStart, end: entry.heldEnd }, held) ? entry : fitMyTime(entry, held)
      if (mine && !sameSpan(mine, held)) next = { ...withTimes(base, mine), held }
    }
    if (next === e || (e.held && next.held && sameSpan(e, next) && sameSpan(e.held, next.held))) return e
    changed = true
    return next
  })
  return changed ? out : (events as CalendarEvent[])
}

/**
 * 同期。サーバーには利用者ごとに 1 行（`user_my_event_times`、`049`）。両方で変えたときは予定ごとに新しいほう（`updatedAt`）を取る
 * （計画は `settingPlans.ts` の `planMyEventTimesSync`）
 */
export type LocalMyEventTimes = { times: MyEventTime[]; updatedAt: string | null; syncedAt?: string | null }
export type RemoteMyEventTimes = { times: MyEventTime[]; updatedAt: string }
export type MyEventTimesSyncPlan = {
  apply?: { times: MyEventTime[]; updatedAt: string }
  push?: RemoteMyEventTimes & { base: string | null }
  adopt?: string
  /** 両方で変えて片方を捨てた数（予定ごとに新しいほうを取るので 0） */
  conflicts?: number
}
