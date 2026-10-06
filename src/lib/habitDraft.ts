import {
  HABIT_TIMES_PER_WEEK_MAX,
  HABIT_TIMES_PER_WEEK_MIN,
  type HabitFrequency,
  type HabitFrequencyType,
  type HabitTimeMode,
  type HabitWeekday,
} from '../types/habit'

export type HabitDraftFields = {
  title: string
  freq: HabitFrequencyType
  weekdays: HabitWeekday[]
  timesPerWeek: number
  timeMode: HabitTimeMode
  startTime: string
  endTime: string
}

function isTimesPerWeekCount(n: number): boolean {
  return Number.isInteger(n) && n >= HABIT_TIMES_PER_WEEK_MIN && n <= HABIT_TIMES_PER_WEEK_MAX
}

/** 追加・編集フォームの送信可否（タイトルは trim して判定） */
export function canSubmitHabitDraft(d: HabitDraftFields): boolean {
  if (!d.title.trim()) return false
  if (d.freq === 'weekly' && d.weekdays.length === 0) return false
  if (d.freq === 'timesPerWeek' && !isTimesPerWeekCount(d.timesPerWeek)) return false
  const hasStartTime = d.startTime.trim().length > 0
  const hasEndTime = d.endTime.trim().length > 0
  if (d.timeMode === 'none') return !hasStartTime && !hasEndTime
  if (d.timeMode === 'fixed') return hasStartTime && !hasEndTime
  if (!hasStartTime || !hasEndTime) return false
  if (d.startTime >= d.endTime) return false
  return true
}

/** フォームの頻度の欄から頻度を作る。曜日・回数は選んでいる頻度の分だけ使う */
export function habitFrequencyFromDraft(freq: HabitFrequencyType, weekdays: HabitWeekday[], timesPerWeek: number): HabitFrequency {
  if (freq === 'weekly') return { type: 'weekly', weekdays }
  if (freq === 'timesPerWeek') return { type: 'timesPerWeek', count: timesPerWeek }
  return { type: 'daily' }
}

export function toggleHabitWeekdaySelection(prev: HabitWeekday[], v: HabitWeekday): HabitWeekday[] {
  return prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v].sort((a, b) => a - b)
}
