/** 週次: 1=月 … 7=日 (date-fns の getDay ではなく ISO 曜日に合わせ getISODay: 1=月) */
export type HabitWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

/**
 * 頻度。
 * - daily: 毎日
 * - weekly: 決めた曜日だけ
 * - timesPerWeek: 週（月曜始まり）に `count` 回。曜日は決めず、どの日にやってもよい
 */
export type HabitFrequency = { type: 'daily' } | { type: 'weekly'; weekdays: HabitWeekday[] } | { type: 'timesPerWeek'; count: number }

export type HabitFrequencyType = HabitFrequency['type']

/** 週に◯回で選べる回数（7 回は毎日と同じなので無い） */
export const HABIT_TIMES_PER_WEEK_MIN = 1
export const HABIT_TIMES_PER_WEEK_MAX = 6

/**
 * 保存データ・同期・バックアップの頻度を読む。知らない形は毎日にする。
 * 曜日は 1〜7 の整数だけ、回数は 1〜6 に収める
 */
export function readHabitFrequency(raw: unknown): HabitFrequency {
  if (typeof raw !== 'object' || raw === null) return { type: 'daily' }
  const f = raw as Record<string, unknown>
  if (f.type === 'weekly' && Array.isArray(f.weekdays)) {
    return { type: 'weekly', weekdays: f.weekdays.filter((d): d is HabitWeekday => Number.isInteger(d) && d >= 1 && d <= 7) }
  }
  if (f.type === 'timesPerWeek' && typeof f.count === 'number' && Number.isFinite(f.count)) {
    const count = Math.min(HABIT_TIMES_PER_WEEK_MAX, Math.max(HABIT_TIMES_PER_WEEK_MIN, Math.round(f.count)))
    return { type: 'timesPerWeek', count }
  }
  return { type: 'daily' }
}

export type HabitTimeMode = 'none' | 'fixed' | 'range'

/** その日だけの時間（タイムラインで習慣の枠を動かした日）。時刻ひとつの習慣は終わりを持たない */
export interface HabitTimeOverride {
  startTime: string
  endTime: string | null
}

/** yyyy-MM-dd → その日だけの時間 */
export type HabitTimeOverrides = Record<string, HabitTimeOverride>

const OVERRIDE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const OVERRIDE_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

/** 保存データ・同期・バックアップのその日だけの時間を読む。読めない日は捨て、1 日も無ければ undefined */
export function readHabitTimeOverrides(raw: unknown): HabitTimeOverrides | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
  const out: HabitTimeOverrides = {}
  for (const [date, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!OVERRIDE_DATE_RE.test(date) || typeof v !== 'object' || v === null) continue
    const { startTime, endTime } = v as Record<string, unknown>
    if (typeof startTime !== 'string' || !OVERRIDE_TIME_RE.test(startTime)) continue
    out[date] = { startTime, endTime: typeof endTime === 'string' && OVERRIDE_TIME_RE.test(endTime) ? endTime : null }
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export interface Habit {
  id: string
  title: string
  color: string
  timeMode: HabitTimeMode
  startTime: string | null
  endTime: string | null
  frequency: HabitFrequency
  createdAt: string
  updatedAt: string
  /** yyyy-MM-dd で達成済み */
  completedDates: string[]
  /** アーカイブした時刻（ISO）。null は使用中。アーカイブした習慣は今日の計画・一覧・タイムライン・統計から外れ、達成日は残す */
  archivedAt: string | null
  /** 日ごとの時間（タイムラインで枠を動かした日だけ）。無い日は上の時間。1 日も無ければ項目ごと無い */
  timeOverrides?: HabitTimeOverrides
}

/** 使用中か（アーカイブしていない）。古いデータで項目が無いものも使用中 */
export function isHabitActive(habit: Pick<Habit, 'archivedAt'>): boolean {
  return !habit.archivedAt
}

export function inferHabitTimeMode(startTime: string | null, endTime: string | null): HabitTimeMode {
  const hasStart = typeof startTime === 'string' && startTime.trim().length > 0
  const hasEnd = typeof endTime === 'string' && endTime.trim().length > 0
  if (hasStart && hasEnd) return 'range'
  if (hasStart) return 'fixed'
  return 'none'
}
