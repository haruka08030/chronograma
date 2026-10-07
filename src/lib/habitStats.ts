import { addDays, addWeeks, startOfWeek, subDays, subWeeks } from 'date-fns'
import { isHabitActive, type Habit } from '../types/habit'
import { habitWeekDates, habitWeekDoneCount, isHabitScheduledOnDate } from './habitSchedule'
import { habitDayStatus, type HabitRecordIndex } from './habitTiming'
import { appDayKeyOf, appToday } from './timeZone'
import { fromDateKey, toDateKey } from './dateKey'

/** 連続を数えにさかのぼる上限（日・週） */
const STREAK_MAX_DAYS = 1200
const STREAK_MAX_WEEKS = 200

/** 達成率・連続日数に数える日か。時間を決めた習慣は時間どおりの日だけ（`records` を渡したとき） */
function achieved(h: Habit, key: string, records?: HabitRecordIndex): boolean {
  return habitDayStatus(h, key, records) === 'done'
}

const isTimesPerWeek = (h: Habit) => h.frequency.type === 'timesPerWeek'

/**
 * 達成率・ヒートマップ・週のふりかえりの分母に入れる日か: 予定の日で、習慣を作った日（アプリの日付）以降。
 * 作る前の日でも達成を付けていれば（取り込みなど）数える
 */
export function isHabitCountedOnDate(h: Habit, d: Date, records?: HabitRecordIndex): boolean {
  if (!isHabitScheduledOnDate(h, d)) return false
  const key = toDateKey(d)
  return key >= appDayKeyOf(h.createdAt) || achieved(h, key, records)
}

/** 習慣の画面の詳細で見る達成率の期間（週）。毎日・曜日指定は 28 日、週に◯回は 4 週 */
export const HABIT_RATE_WEEKS = 4

/**
 * 習慣ひとつの直近 `weeks` 週の達成率（%）。数える日が無ければ null（作ったばかりで今日まだなど）。
 * 毎日・曜日指定は日で数え、今日はまだ終わっていないので記録した（達成・時間外）ときだけ数える。
 * 週に◯回は週ごとに◯回のうち何回か（`timesPerWeekTally`）。作った週より前の週は、やった回が無ければ数えない
 */
export function habitRecentRate(h: Habit, records?: HabitRecordIndex, weeks: number = HABIT_RATE_WEEKS): number | null {
  if (!isHabitActive(h)) return null
  const today = appToday()
  const todayKey = toDateKey(today)
  let expected = 0
  let completed = 0
  if (h.frequency.type === 'timesPerWeek') {
    const createdKey = appDayKeyOf(h.createdAt)
    for (let w = 0; w < weeks; w++) {
      const anchor = subWeeks(today, w)
      const tally = timesPerWeekTally(h, anchor, todayKey, records)
      const weekEnd = toDateKey(habitWeekDates(anchor)[6])
      if (weekEnd < createdKey && tally.completed === 0) continue
      expected += tally.expected
      completed += tally.completed
    }
  } else {
    for (let i = 0; i < weeks * 7; i++) {
      const d = subDays(today, i)
      if (!isHabitCountedOnDate(h, d, records)) continue
      const status = habitDayStatus(h, toDateKey(d), records)
      // 今日は未記録なら数えない。時間外はもう結果が出ているので数える
      if (i === 0 && status === 'missed') continue
      expected++
      if (status === 'done') completed++
    }
  }
  if (expected === 0) return null
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
  // 毎日・曜日指定の習慣が無いと途切れる日が無いので、日では数えない（`habitStreak` が週で数える）
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

/** 数え始める日: 作った日（アプリの日付）と最初に達成を付けた日（取り込みなど）の早いほう。さかのぼりすぎない */
function streakStartKey(h: Habit): string {
  const first = h.completedDates.reduce((min, k) => (k < min ? k : min), appDayKeyOf(h.createdAt))
  const limit = toDateKey(subDays(appToday(), STREAK_MAX_DAYS))
  return first < limit ? limit : first
}

/**
 * 習慣ひとつのいちばん長かった連続（今の連続も含む）。数え方は `habitStreak` と同じ:
 * 毎日・曜日指定は予定の日にやらなかったら途切れ（予定の無い日・今日の未記録では途切れない）、週に◯回は回数を満たした週
 */
export function habitLongestStreak(h: Habit, records?: HabitRecordIndex): HabitStreak {
  const today = appToday()
  const todayKey = toDateKey(today)
  const start = fromDateKey(streakStartKey(h))
  let run = 0
  let best = 0
  if (h.frequency.type === 'timesPerWeek') {
    const count = h.frequency.count
    const thisWeek = toDateKey(habitWeekDates(today)[0])
    for (let w = startOfWeek(start, { weekStartsOn: 1 }); toDateKey(w) <= thisWeek; w = addWeeks(w, 1)) {
      if (habitWeekDoneCount(h, w, records) >= count) best = Math.max(best, ++run)
      // 今週はまだ途中なので、満たしていなくても途切れさせない
      else if (toDateKey(w) !== thisWeek) run = 0
    }
    return { count: best, unit: 'week' }
  }
  for (let d = start; toDateKey(d) <= todayKey; d = addDays(d, 1)) {
    const key = toDateKey(d)
    if (achieved(h, key, records)) best = Math.max(best, ++run)
    else if (key !== todayKey && isHabitScheduledOnDate(h, d)) run = 0
  }
  return { count: best, unit: 'day' }
}
