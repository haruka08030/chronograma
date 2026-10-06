import { addDays, getISODay, startOfWeek } from 'date-fns'
import { isHabitActive, type Habit, type HabitWeekday } from '../types/habit'
import { habitDayStatus, type HabitRecordIndex } from './habitTiming'
import { toDateKey } from './dateKey'

/**
 * その日にやる習慣か。アーカイブした習慣はどの日にも入らない（今日の計画・タイムライン・統計・週のふりかえりから外れる）。
 * 週に◯回の習慣はどの日にやってもよいので、毎日入る（その週の回数を満たした日は `isHabitWeekGoalMetOnDate` で控えめにする）
 */
export function isHabitScheduledOnDate(habit: Habit, date: Date): boolean {
  if (!isHabitActive(habit)) return false
  if (habit.frequency.type === 'daily' || habit.frequency.type === 'timesPerWeek') return true
  const weekday = getISODay(date) as HabitWeekday
  return habit.frequency.weekdays.includes(weekday)
}

/** その日を含む週（月曜始まり。習慣画面の週・週のふりかえりと同じ）の 7 日 */
export function habitWeekDates(date: Date): Date[] {
  const start = startOfWeek(date, { weekStartsOn: 1 })
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/** その日を含む週に達成した日数（時間を決めた習慣は時間どおりの日だけ。`records` を渡したとき） */
export function habitWeekDoneCount(habit: Habit, date: Date, records?: HabitRecordIndex): number {
  return habitWeekDates(date).filter((d) => habitDayStatus(habit, toDateKey(d), records) === 'done').length
}

/**
 * 週に◯回の習慣で、その日はまだやっていないが、ほかの日でその週の回数をもう満たしているか（「今週は達成」）。
 * その日にやった（達成・時間外）なら false（その日の結果をそのまま出す）
 */
export function isHabitWeekGoalMetOnDate(habit: Habit, date: Date, records?: HabitRecordIndex): boolean {
  if (habit.frequency.type !== 'timesPerWeek' || !isHabitActive(habit)) return false
  if (habitDayStatus(habit, toDateKey(date), records) !== 'missed') return false
  return habitWeekDoneCount(habit, date, records) >= habit.frequency.count
}

/** その日にやることが残っている習慣か（予定の日で、週に◯回ならその週の回数をまだ満たしていない） */
export function isHabitDueOnDate(habit: Habit, date: Date, records?: HabitRecordIndex): boolean {
  return isHabitScheduledOnDate(habit, date) && !isHabitWeekGoalMetOnDate(habit, date, records)
}
