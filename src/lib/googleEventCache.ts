import type { CalendarEvent } from '../types/calendarEvent'

/**
 * 前に取った Google の予定（範囲ごと）。開いた・期間を移ったときにまずこれを出し、取り直した結果で入れ替える（#423）。
 * 持ち主（ログインしている人）ごと。ほかの人の分は読まない。ログアウトと連携の解除で消す（予定の題名を端末に残さない）。
 * アプリから書き込んだ予定はそこから外す（動かす前の位置が一瞬出ないように。取り直せばまた入る）
 */
const KEY = 'chronograma.googleEvents'
/** 覚えておく範囲の数（古く使ったものから捨てる）。1 週で数 kB */
export const MAX_RANGES = 16
/** これより前に取ったものは出さない（古すぎて、出してから大きく変わる） */
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

type Entry = { at: number; events: CalendarEvent[] }
type Stored = { owner: string; ranges: Record<string, Entry> }

/** 範囲のキー（`fetchCalendarEvents` に渡す範囲とタイムゾーン） */
export function rangeKey(timeMin: Date, timeMax: Date, timeZone: string): string {
  return `${timeMin.getTime()}|${timeMax.getTime()}|${timeZone}`
}

function read(owner: string): Stored {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Stored | null
    if (parsed && parsed.owner === owner && parsed.ranges && typeof parsed.ranges === 'object') return parsed
  } catch {
    /* 読めなければ無いものとして */
  }
  return { owner, ranges: {} }
}

/** 覚えている予定と、いつ取ったか。無い・古すぎるなら null */
export function cachedGoogleEvents(owner: string, key: string, now = Date.now()): Entry | null {
  const entry = read(owner).ranges[key]
  if (!entry || !Array.isArray(entry.events) || now - entry.at > MAX_AGE_MS) return null
  return entry
}

export function cacheGoogleEvents(owner: string, key: string, events: CalendarEvent[], now = Date.now()): void {
  const stored = read(owner)
  stored.ranges[key] = { at: now, events }
  const keys = Object.keys(stored.ranges).sort((a, b) => stored.ranges[b]!.at - stored.ranges[a]!.at)
  for (const old of keys.slice(MAX_RANGES)) delete stored.ranges[old]
  try {
    localStorage.setItem(KEY, JSON.stringify(stored))
  } catch {
    // 入りきらなければ覚えない（次も取りに行くだけ）
    clearGoogleEventCache()
  }
}

/** その予定を、覚えているどの範囲からも外す */
export function dropCachedGoogleEvent(eventId: string): void {
  let stored: Stored | null = null
  try {
    stored = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Stored | null
  } catch {
    /* 読めなければ何もしない */
  }
  if (!stored?.ranges) return
  let changed = false
  for (const entry of Object.values(stored.ranges)) {
    const kept = entry.events.filter((e) => e.id !== eventId)
    if (kept.length !== entry.events.length) {
      entry.events = kept
      changed = true
    }
  }
  if (!changed) return
  try {
    localStorage.setItem(KEY, JSON.stringify(stored))
  } catch {
    clearGoogleEventCache()
  }
}

export function clearGoogleEventCache(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* 消せなくても、持ち主が違えば読まない */
  }
}
