import { addDays, addMonths, addWeeks, endOfMonth, startOfMonth, startOfWeek } from 'date-fns'
import { HABIT_WEEK_STARTS_ON } from './habitSchedule'

/**
 * ふりかえりの期間（#304）。週は月曜はじまり（設定の週の開始日に従わない。#325・`HABIT_WEEK_STARTS_ON`）、
 * 月はアプリのタイムゾーンの暦の月（1 日〜末日）。日付はアプリの日（`fromDateKey` / `zonedNow` の Date）で渡す
 */
export type ReviewPeriod = 'week' | 'month'

/** `anchor` を含む期間の最初の日 */
export function reviewPeriodStart(period: ReviewPeriod, anchor: Date): Date {
  return period === 'month' ? startOfMonth(anchor) : startOfWeek(anchor, { weekStartsOn: HABIT_WEEK_STARTS_ON })
}

/** `anchor` を含む期間の日（週は 7 日、月は 28〜31 日） */
export function reviewPeriodDays(period: ReviewPeriod, anchor: Date): Date[] {
  const start = reviewPeriodStart(period, anchor)
  const length = period === 'month' ? endOfMonth(anchor).getDate() : 7
  return Array.from({ length }, (_, i) => addDays(start, i))
}

/**
 * 期間を `n` 個ずらす（週は `n` 週、月は `n` か月）。月は日を末日に丸める（3/31 の 1 か月前は 2/28）ので、
 * 「今」をずらすと前の月も同じ日まで（短い月なら末日まで）で打ち切られる
 */
export function shiftReviewPeriod(period: ReviewPeriod, date: Date, n: number): Date {
  return period === 'month' ? addMonths(date, n) : addWeeks(date, n)
}

/**
 * 月のふりかえりで「週に◯回」の習慣を数える週（月曜はじまり）の最初の日。
 * 月をまたぐ週は、4 日以上がその月にある週（木曜がその月にある週）だけをその月に入れる（どの週もどれか 1 つの月に入る）
 */
export function monthHabitWeekStarts(anchor: Date): Date[] {
  const month = anchor.getMonth()
  const out: Date[] = []
  for (let w = startOfWeek(startOfMonth(anchor), { weekStartsOn: HABIT_WEEK_STARTS_ON }); ; w = addWeeks(w, 1)) {
    const thursday = addDays(w, 3)
    if (thursday > endOfMonth(anchor)) break
    if (thursday.getMonth() === month) out.push(w)
  }
  return out
}
