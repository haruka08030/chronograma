import { getISODay } from 'date-fns'
import { isHabitActive, type Habit, type HabitWeekday } from '../types/habit'

/** その日にやる習慣か。アーカイブした習慣はどの日にも入らない（今日の計画・タイムライン・統計・週のふりかえりから外れる） */
export function isHabitScheduledOnDate(habit: Habit, date: Date): boolean {
  if (!isHabitActive(habit)) return false
  if (habit.frequency.type === 'daily') return true
  const weekday = getISODay(date) as HabitWeekday
  return habit.frequency.weekdays.includes(weekday)
}
