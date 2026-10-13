import { addDays, endOfWeek, startOfWeek } from 'date-fns'

/**
 * 週の開始日（設定「週の開始日」）。値は date-fns の `weekStartsOn` と同じ（0 = 日曜、1 = 月曜、6 = 土曜）。既定は月曜。
 *
 * 従うのは「カレンダーとして並べる」所だけ: カレンダーの週・月表示、日付ピッカー、週の見出しの範囲、習慣の月のカレンダー。
 * 習慣の「週に◯回」・週のふりかえり・統計の週の集計・クイック追加の「今週中」は月曜はじまりのまま（doc/RULES.md）。
 * 設定を変えても、過去の週の回数や連続が変わらないように。
 *
 * 画面のコードは `useWeekStartsOn()`（hooks/useWeekStartsOn.ts）で読む（変えたら描き直す）。
 * React の外は `appWeekStartsOn()`（ストアが読み込み時・変更時に `setAppWeekStartSetting` で合わせる）
 */
export type WeekStartDay = 0 | 1 | 6

export const WEEK_START_OPTIONS: readonly WeekStartDay[] = [6, 0, 1]
export const DEFAULT_WEEK_STARTS_ON: WeekStartDay = 1

/** 保存されていた値を読む。知らない値・前の版（項目なし）は月曜 */
export function normalizeWeekStart(v: unknown): WeekStartDay {
  return v === 0 || v === 1 || v === 6 ? v : DEFAULT_WEEK_STARTS_ON
}

let appSetting: WeekStartDay = DEFAULT_WEEK_STARTS_ON

/** ストアが読み込み時・変更時に呼ぶ */
export function setAppWeekStartSetting(v: unknown) {
  appSetting = normalizeWeekStart(v)
}

export function appWeekStartsOn(): WeekStartDay {
  return appSetting
}

/** その日を含む、カレンダーの週の最初の日 */
export function calendarWeekStart(date: Date, weekStartsOn: WeekStartDay = appSetting): Date {
  return startOfWeek(date, { weekStartsOn })
}

/** その日を含む、カレンダーの週の最後の日（時刻は 23:59:59.999） */
export function calendarWeekEnd(date: Date, weekStartsOn: WeekStartDay = appSetting): Date {
  return endOfWeek(date, { weekStartsOn })
}

/** その日を含む週の 7 日 */
export function calendarWeekDays(date: Date, weekStartsOn: WeekStartDay = appSetting): Date[] {
  const start = calendarWeekStart(date, weekStartsOn)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/** 月のカレンダーに並べる日（その月を含む週を、週の最初の日から最後の日まで） */
export function monthGridDays(month: Date, weekStartsOn: WeekStartDay = appSetting): Date[] {
  const start = calendarWeekStart(new Date(month.getFullYear(), month.getMonth(), 1), weekStartsOn)
  const end = calendarWeekEnd(new Date(month.getFullYear(), month.getMonth() + 1, 0), weekStartsOn)
  const out: Date[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d)
  return out
}

/** その日が週の何日目か（0 = 週の最初の日） */
export function dayIndexInWeek(date: Date, weekStartsOn: WeekStartDay = appSetting): number {
  return (date.getDay() - weekStartsOn + 7) % 7
}

/** 月曜から並べた曜日名（ロケールの `calendar.weekdayInitials` など）を、週の最初の日から並べ直す */
export function weekdayLabelsFrom<T>(mondayFirst: readonly T[], weekStartsOn: WeekStartDay = appSetting): T[] {
  // 月曜から数えて何番目に始めるか（日曜 = 6、土曜 = 5）
  const offset = (weekStartsOn + 6) % 7
  return [...mondayFirst.slice(offset), ...mondayFirst.slice(0, offset)]
}
