import type { Habit } from '../types/habit'
import { isHabitScheduledOn } from '../../supabase/functions/_shared/dayResult.ts'
import { habitRecordFor, habitUsualTimesOn, type HabitRecordIndex } from './habitTiming'
import { dateKeyOfDayIndex, dayIndexOf } from './wallTime'
import { timeToMinutes } from './clockTime'

/** ルーティンの詳細で見るずれの期間（日） */
export const ROUTINE_DRIFT_DAYS = 28

/** ルーティンのその日の始まりのずれ */
export interface RoutineDriftDay {
  dateKey: string
  /** 記録を始めた時刻 */
  startTime: string
  /** いつもの時間からのずれ（分）。遅れたら +、早ければ − */
  minutes: number
}

/**
 * ルーティンの直近 `days` 日（今日まで）の、いつもの時間（その日だけ動かした時間ではなく、その曜日の時間）からの始まりのずれ。新しい日から。
 * 記録の無い日・予定の無い日・休みの日は入れない。記録はその日のルーティンの記録（つながった記録、無ければ同じ名前の記録。`habitRecordFor`）
 */
export function routineDriftDays(
  habit: Habit,
  records: HabitRecordIndex,
  todayKey: string,
  days: number = ROUTINE_DRIFT_DAYS,
): RoutineDriftDay[] {
  const out: RoutineDriftDay[] = []
  const today = dayIndexOf(todayKey)
  for (let i = 0; i < days; i++) {
    const key = dateKeyOfDayIndex(today - i)
    if (!isHabitScheduledOn(habit, key)) continue
    const usual = habitUsualTimesOn(habit, key)
    const record = usual && habitRecordFor(records, habit, key)
    if (!usual || !record?.dueDate || !record.startTime) continue
    const dayGap = dayIndexOf(record.dueDate) - dayIndexOf(key)
    out.push({
      dateKey: key,
      startTime: record.startTime,
      minutes: dayGap * 1440 + timeToMinutes(record.startTime) - timeToMinutes(usual.startTime),
    })
  }
  return out
}

/** ずれの平均（分、四捨五入）。日が無ければ null */
export function averageRoutineDrift(days: readonly RoutineDriftDay[]): number | null {
  if (days.length === 0) return null
  return Math.round(days.reduce((a, d) => a + d.minutes, 0) / days.length)
}
