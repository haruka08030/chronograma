import type { CalendarEvent } from '../types/calendarEvent'
import { appTodayKey } from './timeZone'

/**
 * やらなかった予定（#528）。gym・行かなかったイベント・休んだ授業など、予定していたけれどやらなかった Google の予定は、
 * 時間が過ぎてから Google かアプリで消されることが多い。消すとアプリからも消え、最初から予定が無かったように見えるので、
 * 開始を過ぎてから消された予定は、その日の予定の列に薄く・取り消し線で残す。
 *
 * - 開始より前に消した予定は、前もって取りやめたものとして残さない。開始から `SKIP_WINDOW_MS` より後に消した予定は古い予定の片付け
 *   （Google で消された分は関数が選んで返す。`supabase/functions/google-calendar/deleted.ts` の `skippedCandidates`）
 * - Google は消された予定をいつまでも返さないので、残した予定は自分で持ち、端末間で同期する（`user_skipped_events`、`045`）
 * - 「消す」で本当に消した予定は、Google が消された予定を返す間にまた残さないよう、消した印（`removed`）だけ持っておく
 */

/** 開始からこれより後に消した予定は残さない（関数の `SKIP_WINDOW_MS` とそろえる） */
export const SKIP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
/** 覚えておける数（DB の大きさの上限に収まる数）。超えたら日付の古いものから落とす */
export const SKIPPED_MAX = 500
/** 本当に消した印を持っておく長さ（Google が返す期間を十分に越える） */
const REMOVED_KEEP_MS = 30 * 24 * 60 * 60 * 1000
const TEXT_MAX = 200

export type SkippedEvent = Pick<
  CalendarEvent,
  | 'id'
  | 'summary'
  | 'start'
  | 'end'
  | 'startTime'
  | 'endTime'
  | 'date'
  | 'isAllDay'
  | 'colorId'
  | 'recurringEventId'
  | 'baseColor'
  | 'ownColor'
> & {
  /** 消された時刻 */
  skippedAt: string
  /** 「消す」で本当に消した */
  removed?: true
}

const str = (v: unknown): v is string => typeof v === 'string'
const optStr = (v: unknown) => (str(v) ? v : undefined)

/** 保存・同期から読んだ値をそろえる。同じ予定は先のもの。日付の新しい順で、数は上限まで */
export function normalizeSkippedEvents(raw: unknown): SkippedEvent[] {
  if (!Array.isArray(raw)) return []
  const out: SkippedEvent[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    const x = item as Record<string, unknown> | null
    if (!x || !str(x.id) || !x.id || seen.has(x.id) || !str(x.start) || !str(x.end) || !str(x.date) || !str(x.skippedAt)) continue
    if (!/^\d{4}-\d{2}-\d{2}$/.test(x.date)) continue
    seen.add(x.id)
    const isAllDay = x.isAllDay === true
    out.push({
      id: x.id,
      summary: str(x.summary) ? x.summary.slice(0, TEXT_MAX) : '',
      start: x.start,
      end: x.end,
      startTime: isAllDay || !str(x.startTime) ? null : x.startTime,
      endTime: isAllDay || !str(x.endTime) ? null : x.endTime,
      date: x.date,
      isAllDay,
      colorId: optStr(x.colorId),
      recurringEventId: optStr(x.recurringEventId),
      baseColor: optStr(x.baseColor),
      ownColor: x.ownColor === true ? true : undefined,
      skippedAt: x.skippedAt,
      ...(x.removed === true ? { removed: true as const } : {}),
    })
  }
  return clean(out)
}

/** 日付の新しい順・上限まで。undefined の項目は持たない（同期で比べたときに違って見えないように） */
function clean(list: SkippedEvent[]): SkippedEvent[] {
  return [...list]
    .sort((a, b) => b.date.localeCompare(a.date) || b.start.localeCompare(a.start) || a.id.localeCompare(b.id))
    .slice(0, SKIPPED_MAX)
    .map((e) => Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined)) as SkippedEvent)
}

/** 予定の開始（ミリ秒）。終日の予定は null（日付で比べる） */
const startMs = (e: Pick<CalendarEvent, 'start' | 'isAllDay'>) => (e.isAllDay ? null : Date.parse(e.start))

/**
 * アプリで消した予定を、やらなかった予定として残すか。開始を過ぎてから（終日はその日になってから）、`SKIP_WINDOW_MS` までに消した予定
 */
export function isSkippedDeletion(
  e: Pick<CalendarEvent, 'start' | 'date' | 'isAllDay'>,
  now = Date.now(),
  todayKey = appTodayKey(),
): boolean {
  if (e.isAllDay) {
    if (e.date > todayKey) return false
    const days = (Date.parse(`${todayKey}T00:00:00Z`) - Date.parse(`${e.date}T00:00:00Z`)) / 86_400_000
    return days * 86_400_000 <= SKIP_WINDOW_MS
  }
  const at = startMs(e)
  return at !== null && Number.isFinite(at) && at <= now && now - at <= SKIP_WINDOW_MS
}

/** 予定から、やらなかった予定の控えを作る */
export function toSkippedEvent(e: CalendarEvent, skippedAt: string): SkippedEvent {
  return normalizeSkippedEvents([{ ...e, skippedAt }])[0]!
}

/** やらなかった予定を足す。もう持っている予定（本当に消した印も）はそのまま。変わらなければ同じ並びを返す */
export function withSkipped(list: readonly SkippedEvent[], additions: readonly SkippedEvent[], now = Date.now()): SkippedEvent[] {
  const known = new Set(list.map((e) => e.id))
  const fresh = additions.filter((e) => !known.has(e.id))
  const kept = list.filter((e) => !e.removed || now - Date.parse(e.skippedAt) <= REMOVED_KEEP_MS)
  if (fresh.length === 0 && kept.length === list.length) return list as SkippedEvent[]
  return clean([...kept, ...fresh])
}

/** 予定に戻った（Google でもとに戻した・アプリで消すのを取り消した）予定を外す。本当に消した印は残す。変わらなければ同じ並び */
export function withoutRestored(list: readonly SkippedEvent[], liveIds: ReadonlySet<string>): SkippedEvent[] {
  const next = list.filter((e) => e.removed || !liveIds.has(e.id))
  return next.length === list.length ? (list as SkippedEvent[]) : next
}

/** 「消す」: 間違えて入れた予定などを、やらなかった予定からも消す（消した印だけ残す） */
export function withRemoved(list: readonly SkippedEvent[], id: string, nowIso = new Date().toISOString()): SkippedEvent[] {
  return list.map((e) => (e.id === id ? { ...e, removed: true as const, skippedAt: nowIso } : e))
}

/** 画面に出すやらなかった予定（Google の予定の形。動かせない） */
export function skippedAsEvents(list: readonly SkippedEvent[]): CalendarEvent[] {
  return list
    .filter((e) => !e.removed)
    .map((e) => {
      const event: CalendarEvent & Partial<Pick<SkippedEvent, 'skippedAt' | 'removed'>> = { ...e, editable: false, skipped: true }
      delete event.skippedAt
      delete event.removed
      return event
    })
}

/** Google の予定に、やらなかった予定を混ぜる（Google にある予定が先） */
export function withSkippedEvents(live: readonly CalendarEvent[], skipped: readonly CalendarEvent[]): CalendarEvent[] {
  if (skipped.length === 0) return live as CalendarEvent[]
  const ids = new Set(live.map((e) => e.id))
  const extra = skipped.filter((e) => !ids.has(e.id))
  return extra.length === 0 ? (live as CalendarEvent[]) : [...live, ...extra]
}

/** 両方の端末で変えた並びを合わせる（どちらかで本当に消した予定は消したまま。ほかは先の並びのもの） */
export function mergeSkipped(a: readonly SkippedEvent[], b: readonly SkippedEvent[]): SkippedEvent[] {
  const byId = new Map<string, SkippedEvent>()
  for (const e of [...a, ...b]) {
    const prev = byId.get(e.id)
    if (!prev || (e.removed && !prev.removed)) byId.set(e.id, e)
  }
  return clean([...byId.values()])
}

export const sameSkipped = (a: readonly SkippedEvent[], b: readonly SkippedEvent[]) =>
  a.length === b.length && a.every((x, i) => JSON.stringify(x) === JSON.stringify(b[i]))

/**
 * 同期。サーバーには利用者ごとに 1 行（`user_skipped_events`、`045`）。並び全体を 1 つの値として扱う（計画は `settingPlans.ts` の `planSkippedSync`）。
 * 予定はどの端末でも Google から見つかるので、両方で変えたとき（とこの端末でまだ一度も合わせていないとき）は両方を合わせる
 */
export type LocalSkipped = { events: SkippedEvent[]; updatedAt: string | null; syncedAt?: string | null }
export type RemoteSkipped = { events: SkippedEvent[]; updatedAt: string }
export type SkippedSyncPlan = {
  apply?: { events: SkippedEvent[]; updatedAt: string }
  push?: RemoteSkipped & { base: string | null }
  adopt?: string
  /** 両方で変えて片方を捨てた数（並びは合わせるので 0） */
  conflicts?: number
}
