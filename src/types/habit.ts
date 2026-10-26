import type { HabitPastRule } from '../../supabase/functions/_shared/habitTiming.ts'

export type { HabitPastRule }

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

/** 曜日（1=月）→ その曜日の時間。「曜日ごとに時間を変える」・枠のカードで「これ以降の◯曜日」の時間を変えたときだけ */
export type HabitWeekdayTimes = Partial<Record<HabitWeekday, HabitTimeOverride>>

/** 保存データ・同期・バックアップの曜日ごとの時間を読む。読めない曜日は捨て、1 つも無ければ undefined */
export function readHabitWeekdayTimes(raw: unknown): HabitWeekdayTimes | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
  const out: HabitWeekdayTimes = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const day = Number(k)
    if (!Number.isInteger(day) || day < 1 || day > 7 || typeof v !== 'object' || v === null) continue
    const { startTime, endTime } = v as Record<string, unknown>
    if (typeof startTime !== 'string' || !OVERRIDE_TIME_RE.test(startTime)) continue
    out[day as HabitWeekday] = { startTime, endTime: typeof endTime === 'string' && OVERRIDE_TIME_RE.test(endTime) ? endTime : null }
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/** 保存データ・同期・バックアップの休みの日を読む。読めない日は捨てて並べ直し、1 日も無ければ undefined */
export function readHabitRestDates(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const dates = [...new Set(raw.filter((d): d is string => typeof d === 'string' && OVERRIDE_DATE_RE.test(d)))].sort()
  return dates.length > 0 ? dates : undefined
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
  /**
   * ゴミ箱に入れた時刻（ISO）。入れた習慣はどの画面・統計にも出さず、ゴミ箱から達成日ごと戻せる。
   * `TRASH_KEEP_DAYS` 日たつと完全に消す。ゴミ箱に無ければ項目ごと無い
   */
  deletedAt?: string
  /** 日ごとの時間（タイムラインで枠を動かした日だけ）。無い日は上の時間。1 日も無ければ項目ごと無い */
  timeOverrides?: HabitTimeOverrides
  /**
   * 休みの日（yyyy-MM-dd、古い順）。予定の日に数えない（連続は止まらず数えもしない。達成率・週のふりかえりの分母から外れる）。
   * 1 日も無ければ項目ごと無い
   */
  restDates?: string[]
  /**
   * 曜日ごとの時間（「曜日ごとに時間を変える」、どの頻度でも）。無い曜日は上の時間。
   * その日だけの時間（`timeOverrides`）がさらに優先。使わなければ項目ごと無い
   */
  weekdayTimes?: HabitWeekdayTimes
  /**
   * 1 回の時間の目標（分、1〜1440）。その日の習慣の記録の合計が届いたら達成（`habitDayStatus`）。
   * 無ければ今までどおりチェックで達成。項目ごと無い
   */
  goalMinutes?: number
  /**
   * 前の日の設定（古い順。`until` より前の日はその設定、`off` は作る前で予定の日にしない）。
   * 作った・頻度や時間を変えた日より前の日の結果を変えないため（`habitAsOf`）。無ければ項目ごと無い
   */
  pastRules?: HabitPastRule[]
  /**
   * `routine` はルーティン（毎日の予定のプリセット。ご飯・お風呂）。タイムラインに枠を出すだけで、今日の計画の行・連続・達成率・
   * 「予定 N 件」に入れない。無ければ習慣（続けたいこと）。項目ごと無い
   */
  kind?: 'routine'
}

/** 保存データ・同期・バックアップの種類を読む。`routine` 以外は習慣（undefined） */
export function readHabitKind(raw: unknown): 'routine' | undefined {
  return raw === 'routine' ? 'routine' : undefined
}

/** ルーティン（毎日の予定のプリセット）か */
export function isRoutine(habit: Pick<Habit, 'kind'>): boolean {
  return habit.kind === 'routine'
}

/** 保存データ・同期・バックアップの前の日の設定を読む。読めない項目は捨てて古い順に並べ、1 つも無ければ undefined */
export function readHabitPastRules(raw: unknown): HabitPastRule[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: HabitPastRule[] = []
  for (const v of raw) {
    if (typeof v !== 'object' || v === null) continue
    const r = v as Record<string, unknown>
    if (typeof r.until !== 'string' || !OVERRIDE_DATE_RE.test(r.until)) continue
    if (r.off === true) {
      out.push({ until: r.until, off: true })
      continue
    }
    const startTime = typeof r.startTime === 'string' && OVERRIDE_TIME_RE.test(r.startTime) ? r.startTime : null
    const endTime = typeof r.endTime === 'string' && OVERRIDE_TIME_RE.test(r.endTime) ? r.endTime : null
    const timeMode =
      r.timeMode === 'none' || r.timeMode === 'fixed' || r.timeMode === 'range' ? r.timeMode : inferHabitTimeMode(startTime, endTime)
    const weekdayTimes = readHabitWeekdayTimes(r.weekdayTimes)
    const goalMinutes = readHabitGoalMinutes(r.goalMinutes)
    out.push({
      until: r.until,
      timeMode,
      startTime,
      endTime,
      frequency: readHabitFrequency(r.frequency),
      ...(weekdayTimes ? { weekdayTimes } : {}),
      ...(goalMinutes ? { goalMinutes } : {}),
    })
  }
  out.sort((a, b) => (a.until < b.until ? -1 : a.until > b.until ? 1 : 0))
  return out.length > 0 ? out : undefined
}

export const HABIT_GOAL_MINUTES_MAX = 1440

/** 保存データ・同期・バックアップの時間の目標を読む。1〜1440 の整数でなければ undefined */
export function readHabitGoalMinutes(raw: unknown): number | undefined {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= HABIT_GOAL_MINUTES_MAX ? raw : undefined
}

/** その日を休みにした習慣か */
export function isHabitRestOn(habit: Pick<Habit, 'restDates'>, dateKey: string): boolean {
  return habit.restDates?.includes(dateKey) ?? false
}

/** ゴミ箱にあるか */
export function isHabitDeleted(habit: Pick<Habit, 'deletedAt'>): boolean {
  return typeof habit.deletedAt === 'string' && habit.deletedAt.length > 0
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
