import type { Habit } from '../types/habit'
import { isHabitDueOnDate } from './habitSchedule'
import { habitDayStatus, habitTimesOn, habitUsualTimesOn, plannedRecordTimes, type HabitRecordIndex } from './habitTiming'
import type { PlannedItem } from '../types/plannedItem'
import { fromDateKey } from './dateKey'
import { timeToMinutes } from './clockTime'
import { habitSlotId } from '../../supabase/functions/_shared/dayResult.ts'

/** タイムラインの習慣の枠の id（`habit-slot::<習慣の id>::<yyyy-MM-dd>`）。通知の数え方（`dayResult.ts`）と同じ */
export { habitSlotId, parseHabitSlotId } from '../../supabase/functions/_shared/dayResult.ts'

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

/**
 * その日の時間が始まりの時刻だけで、長さの決まらない習慣か。タイムラインでは格子に置かず、終日の行の下の習慣の段に出す。
 * 「1 回の目標」があれば長さが決まるので、最初から格子の枠（開始〜開始＋目標）にする
 */
export function isPointHabitOn(habit: Habit, dateKey: string): boolean {
  return !habit.goalMinutes && habitTimesOn(habit, dateKey)?.endTime === null
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

/**
 * 時刻ひとつの習慣（目標なし）・時間を決めていない習慣を、その日だけ格子に置いた（終わりのある枠にした）か。習慣の段のチップに戻せる
 */
export function isPlacedPointHabitOn(habit: Habit, dateKey: string): boolean {
  if (habit.timeMode === 'none') return isUntimedPlacedOn(habit, dateKey)
  return !habit.goalMinutes && habitUsualTimesOn(habit, dateKey)?.endTime === null && habitTimesOn(habit, dateKey)?.endTime != null
}

/** 時間を決めていない習慣を、その日だけ格子に置いたか（今日の計画の行を予定の列に落とした） */
function isUntimedPlacedOn(habit: Habit, dateKey: string): boolean {
  return habitTimesOn(habit, dateKey) !== null
}

/** 習慣の段に出す、その日にやる時間を決めていない習慣（格子に置いた日は除く。並びは習慣の順。週に◯回・休み・アーカイブは今日の計画と同じ） */
export function untimedHabitsOn(
  habits: Habit[],
  dateKey: string,
  records: HabitRecordIndex,
): { habit: Habit; id: string; done: boolean }[] {
  return habits.flatMap((habit) => {
    if (habit.timeMode !== 'none' || isUntimedPlacedOn(habit, dateKey) || !isHabitDueOnDate(habit, fromDateKey(dateKey), records)) return []
    return [{ habit, id: habitSlotId(habit.id, dateKey), done: habitDayStatus(habit, dateKey, records) !== 'missed' }]
  })
}

/**
 * 習慣を格子に落とすときの長さ（分）。その日の時間が範囲ならその長さ、1 回の目標があればその長さ。
 * 時刻ひとつ・時間なしは null（既定の予定の長さ）
 */
export function habitDurationMinutes(habit: Habit, dateKey: string): number | null {
  const times = habitTimesOn(habit, dateKey)
  if (times?.endTime) return (timeToMinutes(times.endTime) - timeToMinutes(times.startTime) + 1440) % 1440 || null
  return habit.goalMinutes ?? null
}
