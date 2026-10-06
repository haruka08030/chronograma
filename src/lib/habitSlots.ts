import type { Habit } from '../types/habit'
import { isHabitDueOnDate } from './habitSchedule'
import { plannedRecordTimes, type HabitRecordIndex } from './habitTiming'
import type { PlannedItem } from '../types/plannedItem'
import { fromDateKey } from './dateKey'

/**
 * タイムライン用。時間を決めた習慣だけ。枠は ✓ で作る記録と同じ（時刻ひとつは許容幅ぶん）。
 * 週に◯回の習慣は、その週の回数を満たしたら、やっていない日には枠を出さない（`records` を渡したとき）
 */
export function habitToPlannedItem(habit: Habit, dateKey: string, records?: HabitRecordIndex): PlannedItem | null {
  if (!isHabitDueOnDate(habit, fromDateKey(dateKey), records)) return null
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
