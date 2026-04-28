import { getISODay } from 'date-fns'
import type { Habit, HabitWeekday } from '../types/habit'

export function isHabitScheduledOnDate(habit: Habit, date: Date): boolean {
  if (habit.frequency.type === 'daily') return true
  const weekday = getISODay(date) as HabitWeekday
  return habit.frequency.weekdays.includes(weekday)
}
