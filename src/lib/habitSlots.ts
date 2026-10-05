import type { Habit } from '../types/habit'
import { isHabitScheduledOnDate } from './habitSchedule'
import { plannedRecordTimes } from './habitTiming'
import type { PlannedItem } from '../types/plannedItem'
import { fromDateKey } from './dateKey'

function habitAppliesOnDate(habit: Habit, dateKey: string): boolean {
  return isHabitScheduledOnDate(habit, fromDateKey(dateKey))
}

/** タイムライン用。時間を決めた習慣だけ。枠は ✓ で作る記録と同じ（時刻ひとつは許容幅ぶん） */
export function habitToPlannedItem(habit: Habit, dateKey: string): PlannedItem | null {
  if (!habitAppliesOnDate(habit, dateKey)) return null
  const times = plannedRecordTimes(habit)
  if (!times) return null
  return {
    id: `habit-slot::${habit.id}::${dateKey}`,
    summary: habit.title,
    startTime: times.startTime,
    endTime: times.endTime,
    source: 'habit',
  }
}
