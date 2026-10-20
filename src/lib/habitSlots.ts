import type { Habit } from '../types/habit'
import { isHabitDueOnDate } from './habitSchedule'
import { habitDayStatus, habitTimesOn, habitUsualTimesOn, plannedRecordTimes, type HabitRecordIndex } from './habitTiming'
import type { PlannedItem } from '../types/plannedItem'
import { fromDateKey } from './dateKey'

const SLOT_PREFIX = 'habit-slot::'

/** タイムラインの習慣の枠の id（`habit-slot::<習慣の id>::<yyyy-MM-dd>`） */
export function habitSlotId(habitId: string, dateKey: string): string {
  return `${SLOT_PREFIX}${habitId}::${dateKey}`
}

/** 習慣の枠の id なら習慣の id と日。ほかの id は null */
export function parseHabitSlotId(id: string): { habitId: string; dateKey: string } | null {
  if (!id.startsWith(SLOT_PREFIX)) return null
  const rest = id.slice(SLOT_PREFIX.length)
  const at = rest.lastIndexOf('::')
  return at > 0 ? { habitId: rest.slice(0, at), dateKey: rest.slice(at + 2) } : null
}

/**
 * タイムライン用。時間を決めた習慣だけ。枠は ✓ で作る記録と同じ（時刻ひとつは許容幅ぶん）。
 * 週に◯回の習慣は、その週の回数を満たしたら、やっていない日には枠を出さない（`records` を渡したとき）
 */
export function habitToPlannedItem(habit: Habit, dateKey: string, records?: HabitRecordIndex): PlannedItem | null {
  if (!isHabitDueOnDate(habit, fromDateKey(dateKey), records)) return null
  const times = plannedRecordTimes(habit, dateKey)
  if (!times) return null
  return {
    id: habitSlotId(habit.id, dateKey),
    summary: habit.title,
    startTime: times.startTime,
    endTime: times.endTime,
    source: 'habit',
  }
}

/** その日の時間が始まりの時刻だけの習慣か。タイムラインでは格子に置かず、終日の行の下の習慣の段に出す */
export function isPointHabitOn(habit: Habit, dateKey: string): boolean {
  return habitTimesOn(habit, dateKey)?.endTime === null
}

/** 習慣の段に出す、その日の時刻ひとつの習慣（時刻順） */
export function pointHabitsOn(
  habits: Habit[],
  dateKey: string,
  records: HabitRecordIndex,
): { habit: Habit; slot: PlannedItem; done: boolean }[] {
  return habits
    .flatMap((habit) => {
      if (!isPointHabitOn(habit, dateKey)) return []
      const slot = habitToPlannedItem(habit, dateKey, records)
      return slot ? [{ habit, slot, done: habitDayStatus(habit, dateKey, records) !== 'missed' }] : []
    })
    .sort((a, b) => a.slot.startTime.localeCompare(b.slot.startTime))
}

/** 時刻ひとつの習慣を、その日だけ格子に置いた（終わりのある枠にした）か。習慣の段のチップに戻せる */
export function isPlacedPointHabitOn(habit: Habit, dateKey: string): boolean {
  return habitUsualTimesOn(habit, dateKey)?.endTime === null && habitTimesOn(habit, dateKey)?.endTime != null
}
