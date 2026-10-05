import type { HabitFrequency, HabitTimeMode, HabitWeekday } from '../types/habit'

export type HabitDraftFields = {
  title: string
  freq: 'daily' | 'weekly'
  weekdays: HabitWeekday[]
  timeMode: HabitTimeMode
  startTime: string
  endTime: string
}

/** 追加・編集フォームの送信可否（タイトルは trim して判定） */
export function canSubmitHabitDraft(d: HabitDraftFields): boolean {
  if (!d.title.trim()) return false
  if (d.freq === 'weekly' && d.weekdays.length === 0) return false
  const hasStartTime = d.startTime.trim().length > 0
  const hasEndTime = d.endTime.trim().length > 0
  if (d.timeMode === 'none') return !hasStartTime && !hasEndTime
  if (d.timeMode === 'fixed') return hasStartTime && !hasEndTime
  if (!hasStartTime || !hasEndTime) return false
  if (d.startTime >= d.endTime) return false
  return true
}

export function habitFrequencyFromDraft(freq: 'daily' | 'weekly', weekdays: HabitWeekday[]): HabitFrequency {
  return freq === 'daily' ? { type: 'daily' } : { type: 'weekly', weekdays }
}

export function toggleHabitWeekdaySelection(prev: HabitWeekday[], v: HabitWeekday): HabitWeekday[] {
  return prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v].sort((a, b) => a - b)
}
