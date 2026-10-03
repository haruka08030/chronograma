import { addHours, format, parse } from 'date-fns'
import type { Habit } from '../types/habit'
import { isHabitScheduledOnDate } from './habitSchedule'
import type { PlannedItem } from '../types/plannedItem'
import { fromDateKey } from './dateKey'

function habitAppliesOnDate(habit: Habit, dateKey: string): boolean {
  return isHabitScheduledOnDate(habit, fromDateKey(dateKey))
}

const DEFAULT_START = '09:00'
const DEFAULT_DURATION_HOURS = 1

function addHoursToTimeString(time: string, hours: number): string {
  const d = parse(time, 'HH:mm', new Date())
  return format(addHours(d, hours), 'HH:mm')
}

/** タイムライン用。時刻未設定ならデフォルト 1h */
export function habitToPlannedItem(habit: Habit, dateKey: string): PlannedItem | null {
  if (!habitAppliesOnDate(habit, dateKey)) return null
  if (habit.timeMode !== 'range') return null
  const start = habit.startTime ?? DEFAULT_START
  const end = habit.endTime ?? addHoursToTimeString(start, DEFAULT_DURATION_HOURS)
  return {
    id: `habit-slot::${habit.id}::${dateKey}`,
    summary: habit.title,
    startTime: start,
    endTime: end,
    source: 'habit',
  }
}
