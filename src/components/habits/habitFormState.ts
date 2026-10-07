import { useReducer } from 'react'
import { hexForGoogleKey } from '../../lib/googleColors'
import { canSubmitHabitDraft, habitFrequencyFromDraft, type HabitDraftFields } from '../../lib/habitDraft'
import type { Habit, HabitFrequencyType, HabitTimeMode, HabitWeekday } from '../../types/habit'

const DEFAULT_WEEKDAYS: HabitWeekday[] = [1, 2, 3, 4, 5]
/** 週に◯回を選んだときの最初の回数 */
const DEFAULT_TIMES_PER_WEEK = 3

/** 習慣の色＝ラベル（記録のラベルと同じ色選び。名前の付いた色を選ぶと、その習慣の記録はそのラベルになる） */
const DEFAULT_HABIT_COLOR = hexForGoogleKey('sage')!

/** 習慣の追加・編集フォームの中身 */
export type HabitFormState = {
  title: string
  freq: HabitFrequencyType
  /** 曜日を指定のときの曜日（ほかの頻度を選んでも残し、戻したときに使う） */
  weekdays: HabitWeekday[]
  /** 週に◯回のときの回数（1〜6。ほかの頻度を選んでも残す） */
  timesPerWeek: number
  timeMode: HabitTimeMode
  startTime: string
  endTime: string
  color: string
}

export const EMPTY_HABIT_FORM: HabitFormState = {
  title: '',
  freq: 'daily',
  weekdays: DEFAULT_WEEKDAYS,
  timesPerWeek: DEFAULT_TIMES_PER_WEEK,
  timeMode: 'range',
  startTime: '09:00',
  endTime: '10:00',
  color: DEFAULT_HABIT_COLOR,
}

/** 編集を始めたときのフォーム（その習慣の今の値） */
export function habitFormFrom(h: Habit): HabitFormState {
  return {
    title: h.title,
    freq: h.frequency.type,
    weekdays: h.frequency.type === 'weekly' ? [...h.frequency.weekdays].sort((a, b) => a - b) : DEFAULT_WEEKDAYS,
    timesPerWeek: h.frequency.type === 'timesPerWeek' ? h.frequency.count : DEFAULT_TIMES_PER_WEEK,
    timeMode: h.timeMode,
    startTime: h.startTime ?? '09:00',
    endTime: h.endTime ?? '10:00',
    color: h.color,
  }
}

/** 使わない時刻は空にして判定する（時刻なしなら開始・終了とも、決まった時刻なら終了を見ない） */
function draftFields(f: HabitFormState): HabitDraftFields {
  return {
    title: f.title,
    freq: f.freq,
    weekdays: f.weekdays,
    timesPerWeek: f.timesPerWeek,
    timeMode: f.timeMode,
    startTime: f.timeMode === 'none' ? '' : f.startTime,
    endTime: f.timeMode === 'range' ? f.endTime : '',
  }
}

export function canSubmitHabitForm(f: HabitFormState): boolean {
  return canSubmitHabitDraft(draftFields(f))
}

/** ストアの addHabit / updateHabit に渡す値 */
export function habitFromForm(f: HabitFormState) {
  return {
    title: f.title.trim(),
    color: f.color,
    timeMode: f.timeMode,
    startTime: f.timeMode === 'none' ? null : f.startTime,
    endTime: f.timeMode === 'range' ? f.endTime : null,
    frequency: habitFrequencyFromDraft(f.freq, f.weekdays, f.timesPerWeek),
  }
}

/** フォームの中身。`patch` で一部の項目を変える */
export function useHabitForm(initial: HabitFormState | (() => HabitFormState)) {
  return useReducer(
    (s: HabitFormState, p: Partial<HabitFormState>) => ({ ...s, ...p }),
    undefined,
    () => (typeof initial === 'function' ? initial() : initial),
  )
}
