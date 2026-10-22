import { addDays, startOfWeek } from 'date-fns'
import { isHabitActive, isHabitRestOn, type Habit } from '../types/habit'
import { isHabitScheduledOn } from '../../supabase/functions/_shared/dayResult.ts'
import { habitDayStatus, type HabitRecordIndex } from './habitTiming'
import { fromDateKey, toDateKey } from './dateKey'

/**
 * その日にやる習慣か。アーカイブした習慣はどの日にも入らない（今日の計画・タイムライン・統計・週のふりかえりから外れる）。
 * 週に◯回の習慣はどの日にやってもよいので、毎日入る（その週の回数を満たした日は `isHabitWeekGoalMetOnDate` で控えめにする）。
 * 休みの日（`restDates`）はどの頻度でも入らない（連続・達成率・ヒートマップ・週のふりかえりの数え方がここを通る）
 */
export function isHabitScheduledOnDate(habit: Habit, date: Date): boolean {
  // 通知の数え方（`dayResult.ts`）と同じもの
  return isHabitScheduledOn(habit, toDateKey(date))
}

/** その日から続く休みの最後の日（「休みを外す」はその日から先の続きをまとめて外す。前の日の休みは残す） */
export function habitRestRunEnd(habit: Pick<Habit, 'restDates'>, dateKey: string): string {
  let end = dateKey
  for (let d = addDays(fromDateKey(dateKey), 1); isHabitRestOn(habit, toDateKey(d)); d = addDays(d, 1)) end = toDateKey(d)
  return end
}

/**
 * 習慣の「週に◯回」・週のふりかえりの週は月曜はじまり（設定の週の開始日には従わない。
 * 変えても過去の週の回数・連続が変わらないように。カレンダーの並びは lib/weekStart.ts）
 */
export const HABIT_WEEK_STARTS_ON = 1 as const

/** その日を含む週（月曜始まり。習慣画面の週・週のふりかえりと同じ）の 7 日 */
export function habitWeekDates(date: Date): Date[] {
  const start = startOfWeek(date, { weekStartsOn: HABIT_WEEK_STARTS_ON })
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/** その日を含む週に達成した日数（時間を決めた習慣は時間どおりの日だけ。`records` を渡したとき） */
export function habitWeekDoneCount(habit: Habit, date: Date, records?: HabitRecordIndex): number {
  return habitWeekDates(date).filter((d) => habitDayStatus(habit, toDateKey(d), records) === 'done').length
}

/**
 * 週に◯回の習慣で、その週に求める回数。休みの日を除いた日数より多くは求めない（週まるごと休みなら 0 で、その週は数えない）
 */
export function habitWeekRequired(habit: Habit, date: Date): number {
  if (habit.frequency.type !== 'timesPerWeek') return 0
  if (!habit.restDates) return habit.frequency.count
  const open = habitWeekDates(date).filter((d) => !isHabitRestOn(habit, toDateKey(d))).length
  return Math.min(habit.frequency.count, open)
}

/**
 * 週に◯回の習慣で、その日はまだやっていないが、ほかの日でその週の回数をもう満たしているか（「今週は達成」）。
 * その日にやった（達成・時間外）なら false（その日の結果をそのまま出す）
 */
export function isHabitWeekGoalMetOnDate(habit: Habit, date: Date, records?: HabitRecordIndex): boolean {
  if (habit.frequency.type !== 'timesPerWeek' || !isHabitActive(habit)) return false
  if (habitDayStatus(habit, toDateKey(date), records) !== 'missed') return false
  return habitWeekDoneCount(habit, date, records) >= habitWeekRequired(habit, date)
}

/** その日にやることが残っている習慣か（予定の日で、週に◯回ならその週の回数をまだ満たしていない） */
export function isHabitDueOnDate(habit: Habit, date: Date, records?: HabitRecordIndex): boolean {
  return isHabitScheduledOnDate(habit, date) && !isHabitWeekGoalMetOnDate(habit, date, records)
}
