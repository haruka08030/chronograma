import { addDays } from 'date-fns'
import type { Habit } from '../types/habit'
import { isHabitActive, isHabitDeleted } from '../types/habit'
import type { Task } from '../types/task'
import { isActiveTask } from './taskLifecycle'
import { fromDateKey, toDateKey } from './dateKey'
import { isHabitScheduledOnDate } from './habitSchedule'
import { isoWeekdayOf, plannedRecordTimes } from './habitTiming'
import { timeToMinutes } from './clockTime'
import { isSleepName, looksLikeSleep, overlappingSleep } from './sleep'
import type { IsoWeekday, SleepSchedule } from './sleepSchedule'

/**
 * 習慣で寝る時間を置いていた人の分を、睡眠に移す（#653）。睡眠のページで確かめてから
 * （`moveHabitToSleep`）: 習慣の時間を睡眠の予定に、その習慣の記録と題名が「睡眠」の記録を睡眠に直し、習慣はアーカイブ
 */

/** 移せる習慣: 使っている・題名が「睡眠」「sleep」など・始まりと終わりのある時間を決めたもの */
export function sleepHabits(habits: readonly Habit[]): Habit[] {
  return habits.filter((h) => isHabitActive(h) && !isHabitDeleted(h) && isSleepName(h.title) && h.timeMode !== 'none' && h.startTime)
}

/**
 * 習慣の時間を睡眠の予定（起きる日の曜日ごと）に。習慣の枠の日（寝る日）が `fromKey` からの 1 週間のどの曜日にあるかで引く。
 * 日をまたぐ枠（23:00–7:00）は次の日の朝、またがない枠（1:00–8:00）はその日の朝の分
 */
export function scheduleFromHabit(habit: Habit, fromKey: string): SleepSchedule {
  const out: SleepSchedule = {}
  for (let i = 0; i < 7; i++) {
    const bedKey = toDateKey(addDays(fromDateKey(fromKey), i))
    if (!isHabitScheduledOnDate(habit, fromDateKey(bedKey))) continue
    const times = plannedRecordTimes(habit, bedKey)
    if (!times || times.startTime === times.endTime) continue
    const crosses = timeToMinutes(times.endTime) <= timeToMinutes(times.startTime)
    const wakeKey = crosses ? toDateKey(addDays(fromDateKey(bedKey), 1)) : bedKey
    out[isoWeekdayOf(wakeKey) as IsoWeekday] = { bed: times.startTime, wake: times.endTime }
  }
  return out
}

export interface SleepMove {
  habit: Habit
  schedule: SleepSchedule
  /** 睡眠に直す記録 */
  convertIds: string[]
  /** もう睡眠のある時間と重なるのでゴミ箱へ入れる記録（同じ夜を 2 回数えない） */
  trashIds: string[]
}

/** 移すと何が変わるか（確かめる画面に件数を出す） */
export function planSleepMove(habit: Habit, tasks: readonly Task[], fromKey: string): SleepMove {
  const candidates = tasks.filter(
    (t) => t.kind === 'log' && isActiveTask(t) && t.startTime && t.endTime && (t.habitId === habit.id || (!t.habitId && looksLikeSleep(t))),
  )
  const convertIds: string[] = []
  const trashIds: string[] = []
  // 直した記録どうしも重ねない（同じ夜に習慣の記録と ▶ の記録がある、など）
  let sleeps: Task[] = tasks.filter((t) => t.kind === 'sleep' && isActiveTask(t))
  for (const t of candidates) {
    if (overlappingSleep(sleeps, withWakeDate(t))) {
      trashIds.push(t.id)
      continue
    }
    convertIds.push(t.id)
    sleeps = [...sleeps, { ...withWakeDate(t), kind: 'sleep' }]
  }
  return { habit, schedule: scheduleFromHabit(habit, fromKey), convertIds, trashIds }
}

/**
 * 起きた日を付けた記録。習慣のチェック・前の版の記録は日をまたいでも終わりの日（`endDate`）が無い（23:00–7:00 で始まりの日だけ）ので、
 * 終わりが始まり以前なら次の日に起きたことにする（`wakeDateOf` と同じ読み方）
 */
export function withWakeDate<T extends Pick<Task, 'dueDate' | 'endDate' | 'startTime' | 'endTime'>>(t: T): T {
  if (t.endDate || !t.dueDate || !t.startTime || !t.endTime) return t
  if (timeToMinutes(t.endTime) > timeToMinutes(t.startTime)) return t
  return { ...t, endDate: toDateKey(addDays(fromDateKey(t.dueDate), 1)) }
}
