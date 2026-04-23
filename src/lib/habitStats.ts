import { format, getISODay, subDays } from 'date-fns'
import type { Habit, HabitWeekday } from '../types/habit'

export function colorIndexForPalette(habitColor: string, listColors: readonly string[]): number {
  const normalized = habitColor.trim().toLowerCase()
  const i = listColors.findIndex((c) => c.trim().toLowerCase() === normalized)
  return i >= 0 ? i : Math.min(4, listColors.length - 1)
}

export function habitDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export function isHabitScheduledOnDate(habit: Habit, d: Date): boolean {
  if (habit.frequency.type === 'daily') return true
  const weekday = getISODay(d) as HabitWeekday
  return habit.frequency.weekdays.includes(weekday)
}

export function completionRatioOnDate(habits: Habit[], d: Date): number {
  if (habits.length === 0) return 0
  const key = habitDateKey(d)
  let expected = 0
  let completed = 0
  for (const h of habits) {
    if (!isHabitScheduledOnDate(h, d)) continue
    expected++
    if (h.completedDates.includes(key)) completed++
  }
  if (expected === 0) return 0
  return completed / expected
}

export function completionsInLast7Days(completedDates: string[]): number {
  const set = new Set(completedDates)
  let n = 0
  const today = new Date()
  for (let i = 0; i < 7; i++) {
    const key = format(subDays(today, i), 'yyyy-MM-dd')
    if (set.has(key)) n++
  }
  return n
}

export function consistencyForLast7Days(habits: Habit[]): number {
  let expected = 0
  let completed = 0
  for (let i = 0; i < 7; i++) {
    const d = subDays(new Date(), i)
    const key = habitDateKey(d)
    for (const h of habits) {
      if (!isHabitScheduledOnDate(h, d)) continue
      expected++
      if (h.completedDates.includes(key)) completed++
    }
  }
  if (expected === 0) return 0
  return Math.round((completed / expected) * 100)
}

/** いずれかの習慣で達成した日が続く最大日数（当日から遡る） */
export function currentStreakDays(habits: Habit[]): number {
  if (habits.length === 0) return 0
  const anyCompletion = new Set(habits.flatMap((h) => h.completedDates))
  let streak = 0
  for (let i = 0; i < 1200; i++) {
    const key = habitDateKey(subDays(new Date(), i))
    if (!anyCompletion.has(key)) break
    streak++
  }
  return streak
}
