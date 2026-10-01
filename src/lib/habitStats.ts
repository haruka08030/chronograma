import { format, subDays } from 'date-fns'
import type { Habit } from '../types/habit'
import { isHabitScheduledOnDate } from './habitSchedule'
import { habitDayStatus, type HabitRecordIndex } from './habitTiming'

export function colorIndexForPalette(habitColor: string, listColors: readonly string[]): number {
  const normalized = habitColor.trim().toLowerCase()
  const i = listColors.findIndex((c) => c.trim().toLowerCase() === normalized)
  return i >= 0 ? i : Math.min(4, listColors.length - 1)
}

export function habitDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

/** 達成率・連続日数に数える日か。時間を決めた習慣は時間どおりの日だけ（`records` を渡したとき） */
function achieved(h: Habit, key: string, records?: HabitRecordIndex): boolean {
  return habitDayStatus(h, key, records) === 'done'
}

export function completionRatioOnDate(habits: Habit[], d: Date, records?: HabitRecordIndex): number {
  if (habits.length === 0) return 0
  const key = habitDateKey(d)
  let expected = 0
  let completed = 0
  for (const h of habits) {
    if (!isHabitScheduledOnDate(h, d)) continue
    expected++
    if (achieved(h, key, records)) completed++
  }
  if (expected === 0) return 0
  return completed / expected
}

export function completionsInLast7Days(habit: Habit, records?: HabitRecordIndex): number {
  let n = 0
  const today = new Date()
  for (let i = 0; i < 7; i++) {
    const key = format(subDays(today, i), 'yyyy-MM-dd')
    if (achieved(habit, key, records)) n++
  }
  return n
}

/**
 * 直近 7 日の達成率（%）。画面上の達成率はすべてこの定義に揃える。
 * 今日はまだ終わっていないので、記録した（達成・時間外）ときだけ数える（昼の時点で下がって見えないように）。
 */
export function consistencyForLast7Days(habits: Habit[], records?: HabitRecordIndex): number {
  let expected = 0
  let completed = 0
  for (let i = 0; i < 7; i++) {
    const d = subDays(new Date(), i)
    const key = habitDateKey(d)
    for (const h of habits) {
      if (!isHabitScheduledOnDate(h, d)) continue
      const status = habitDayStatus(h, key, records)
      // 今日は未記録なら数えない。時間外はもう結果が出ているので数える
      if (i === 0 && status === 'missed') continue
      expected++
      if (status === 'done') completed++
    }
  }
  if (expected === 0) return 0
  return Math.round((completed / expected) * 100)
}

/** いずれかの習慣で達成した日が続く日数。今日まだなら昨日から数える（今日の途中で 0 日に見せない） */
export function currentStreakDays(habits: Habit[], records?: HabitRecordIndex): number {
  if (habits.length === 0) return 0
  const anyAchieved = (i: number) => {
    const key = habitDateKey(subDays(new Date(), i))
    return habits.some((h) => achieved(h, key, records))
  }
  let streak = 0
  const startAt = anyAchieved(0) ? 0 : 1
  for (let i = startAt; i < 1200; i++) {
    if (!anyAchieved(i)) break
    streak++
  }
  return streak
}
