/** 週次: 1=月 … 7=日 (date-fns の getDay ではなく ISO 曜日に合わせ getISODay: 1=月) */
export type HabitWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

export type HabitFrequency = { type: 'daily' } | { type: 'weekly'; weekdays: HabitWeekday[] }

export type HabitTimeMode = 'none' | 'fixed' | 'range'

export interface Habit {
  id: string
  title: string
  color: string
  timeMode: HabitTimeMode
  startTime: string | null
  endTime: string | null
  frequency: HabitFrequency
  createdAt: string
  updatedAt: string
  /** yyyy-MM-dd で達成済み */
  completedDates: string[]
  /** アーカイブした時刻（ISO）。null は使用中。アーカイブした習慣は今日の計画・一覧・タイムライン・統計から外れ、達成日は残す */
  archivedAt: string | null
}

/** 使用中か（アーカイブしていない）。古いデータで項目が無いものも使用中 */
export function isHabitActive(habit: Pick<Habit, 'archivedAt'>): boolean {
  return !habit.archivedAt
}

export function inferHabitTimeMode(startTime: string | null, endTime: string | null): HabitTimeMode {
  const hasStart = typeof startTime === 'string' && startTime.trim().length > 0
  const hasEnd = typeof endTime === 'string' && endTime.trim().length > 0
  if (hasStart && hasEnd) return 'range'
  if (hasStart) return 'fixed'
  return 'none'
}
