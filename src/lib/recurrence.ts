import type { Recurrence } from '../types/task'
import { fromDateKey } from './dateKey'

/** ISO の曜日（1=月 … 7=日） */
export function isoWeekday(d: Date): number {
  return d.getDay() === 0 ? 7 : d.getDay()
}

/** 曜日の配列を読む（1〜7 の整数だけ、重複なし、月曜から順）。空・不正なら undefined */
export function readRecurrenceWeekdays(v: unknown): number[] | undefined {
  if (!Array.isArray(v)) return undefined
  const days = [...new Set(v.filter((d): d is number => Number.isInteger(d) && d >= 1 && d <= 7))].sort((a, b) => a - b)
  return days.length > 0 ? days : undefined
}

/** 同期・バックアップの JSON から繰り返しを組み立てる。曜日は毎週のときだけ持つ */
export function buildRecurrence(type: Recurrence['type'], interval: number, rawWeekdays: unknown): Recurrence {
  const weekdays = type === 'weekly' ? readRecurrenceWeekdays(rawWeekdays) : undefined
  return weekdays ? { type, interval, weekdays } : { type, interval }
}

/**
 * 毎週の繰り返しで回る曜日（月曜から順）。曜日の指定が無ければ締切の曜日だけ。
 * 毎週以外、または締切が無くて決められなければ空
 */
export function recurrenceWeekdays(recurrence: Recurrence, dueDate: string | null): number[] {
  if (recurrence.type !== 'weekly') return []
  const days = readRecurrenceWeekdays(recurrence.weekdays)
  if (days) return days
  return dueDate ? [isoWeekday(fromDateKey(dueDate))] : []
}
