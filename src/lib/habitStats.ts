import { addDays, subDays, subWeeks } from 'date-fns'
import { isHabitActive, type Habit } from '../types/habit'
import { habitWeekDates, habitWeekDoneCount, isHabitScheduledOnDate } from './habitSchedule'
import { habitDayStatus, type HabitRecordIndex } from './habitTiming'
import { appToday } from './timeZone'
import { toDateKey } from './dateKey'

/** 連続を数えにさかのぼる上限（日・週） */
const STREAK_MAX_DAYS = 1200
const STREAK_MAX_WEEKS = 200

/** 達成率・連続日数に数える日か。時間を決めた習慣は時間どおりの日だけ（`records` を渡したとき） */
function achieved(h: Habit, key: string, records?: HabitRecordIndex): boolean {
  return habitDayStatus(h, key, records) === 'done'
}

const isTimesPerWeek = (h: Habit) => h.frequency.type === 'timesPerWeek'

/**
 * その日の達成率（ヒートマップ）。週に◯回の習慣は日ごとの予定が無いので、やった日だけ数える
 * （やらなかった日で率を下げない）
 */
export function completionRatioOnDate(habits: Habit[], d: Date, records?: HabitRecordIndex): number {
  const day = habitsExpectedOnDate(habits, d, records)
  if (day.length === 0) return 0
  return day.filter((x) => x.done).length / day.length
}

/** その日に数える習慣（予定の日の習慣。週に◯回はやった日だけ）と、やったかどうか。ヒートマップの色分けと達成率で同じ数え方にする */
export function habitsExpectedOnDate(habits: Habit[], d: Date, records?: HabitRecordIndex): { habit: Habit; done: boolean }[] {
  const key = toDateKey(d)
  const out: { habit: Habit; done: boolean }[] = []
  for (const h of habits) {
    if (!isHabitScheduledOnDate(h, d)) continue
    const done = achieved(h, key, records)
    if (isTimesPerWeek(h) && !done) continue
    out.push({ habit: h, done })
  }
  return out
}

/**
 * 直近 7 日の達成率（%）。画面上の達成率はすべてこの定義に揃える。
 * 今日はまだ終わっていないので、記録した（達成・時間外）ときだけ数える（昼の時点で下がって見えないように）。
 * 週に◯回の習慣は 7 日で 1 週ぶん: ◯回のうち何回やったか（多くやっても◯回まで）
 */
export function consistencyForLast7Days(habits: Habit[], records?: HabitRecordIndex): number {
  let expected = 0
  let completed = 0
  for (const h of habits) {
    if (h.frequency.type !== 'timesPerWeek' || !isHabitActive(h)) continue
    let done = 0
    for (let i = 0; i < 7; i++) if (achieved(h, toDateKey(subDays(appToday(), i)), records)) done++
    expected += h.frequency.count
    completed += Math.min(done, h.frequency.count)
  }
  for (let i = 0; i < 7; i++) {
    const d = subDays(appToday(), i)
    const key = toDateKey(d)
    for (const h of habits) {
      if (isTimesPerWeek(h) || !isHabitScheduledOnDate(h, d)) continue
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

/**
 * 週に◯回の習慣の、ある週の達成率の分子・分母（週のふりかえり）。
 * まだ終わっていない週は、残りの日（今日が未記録なら今日も）でまだ取り返せる回数を分母に入れない
 * （月曜の時点で 0/3 に見せない）。`todayKey` より後の日は数えない
 */
export function timesPerWeekTally(
  habit: Habit,
  weekAnchor: Date,
  todayKey: string,
  records?: HabitRecordIndex,
): { expected: number; completed: number } {
  if (habit.frequency.type !== 'timesPerWeek') return { expected: 0, completed: 0 }
  const count = habit.frequency.count
  let done = 0
  let open = 0
  for (const d of habitWeekDates(weekAnchor)) {
    const key = toDateKey(d)
    if (key > todayKey) open++
    else if (achieved(habit, key, records)) done++
    else if (key === todayKey && habitDayStatus(habit, key, records) === 'missed') open++
  }
  const completed = Math.min(done, count)
  return { expected: completed + Math.max(0, count - completed - open), completed }
}

/** 連続の数と単位。週に◯回の習慣は「回数を満たした週」で数える */
export type HabitStreak = { count: number; unit: 'day' | 'week' }

/** 週に◯回の習慣で、回数を満たした週が続く数。今週はまだ満たしていなければ先週から数える */
function weekStreak(h: Habit, records?: HabitRecordIndex): number {
  if (h.frequency.type !== 'timesPerWeek') return 0
  const count = h.frequency.count
  const met = (i: number) => habitWeekDoneCount(h, subWeeks(appToday(), i), records) >= count
  let streak = 0
  for (let i = met(0) ? 0 : 1; i < STREAK_MAX_WEEKS; i++) {
    if (!met(i)) break
    streak++
  }
  return streak
}

/**
 * 習慣ひとつの連続。毎日は暦の日、曜日を指定した習慣は予定のある日だけで数える（予定の無い日では途切れない）。
 * 今日まだなら昨日から数える（今日の途中で 0 に見せない）
 */
export function habitStreak(h: Habit, records?: HabitRecordIndex): HabitStreak {
  if (h.frequency.type === 'timesPerWeek') return { count: weekStreak(h, records), unit: 'week' }
  return { count: currentStreakDays([h], records), unit: 'day' }
}

/**
 * いずれかの習慣で達成した日が続く日数。今日まだなら昨日から数える（今日の途中で 0 日に見せない）。
 * 毎日・曜日を指定した習慣のどれにも予定の無い日は、何も達成していなくても途切れない（数えもしない）。
 * 週に◯回の習慣は日ごとの予定が無いので、達成した日だけ数える
 */
export function currentStreakDays(habits: Habit[], records?: HabitRecordIndex): number {
  if (habits.length === 0) return 0
  // 毎日・曜日指定の習慣が無いと途切れる日が無いので、日では数えない（`habitsStreak` が週で数える）
  if (habits.every(isTimesPerWeek)) return 0
  const today = appToday()
  let streak = 0
  for (let i = 0; i < STREAK_MAX_DAYS; i++) {
    const d = addDays(today, -i)
    const key = toDateKey(d)
    if (habits.some((h) => achieved(h, key, records))) {
      streak++
      continue
    }
    // 今日は未達成でもまだ途中なので飛ばす。予定の無い日も飛ばす
    if (i === 0) continue
    if (habits.some((h) => !isTimesPerWeek(h) && isHabitScheduledOnDate(h, d))) break
  }
  return streak
}

/**
 * 習慣の画面の要約に出す連続。毎日・曜日指定の習慣があれば日（`currentStreakDays`）、
 * 週に◯回の習慣だけなら、いちばん長く続いている週の数
 */
export function habitsStreak(habits: Habit[], records?: HabitRecordIndex): HabitStreak {
  if (habits.length > 0 && habits.every(isTimesPerWeek)) {
    return { count: Math.max(...habits.map((h) => weekStreak(h, records))), unit: 'week' }
  }
  return { count: currentStreakDays(habits, records), unit: 'day' }
}
