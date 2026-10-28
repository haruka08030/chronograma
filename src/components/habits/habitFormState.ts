import { useCallback } from 'react'
import { hexForGoogleKey } from '../../lib/googleColors'
import { useDialogDraft } from '../../hooks/useDialogDraft'
import { canSubmitHabitDraft, habitFrequencyFromDraft, type HabitDraftFields } from '../../lib/habitDraft'
import {
  HABIT_GOAL_MINUTES_MAX,
  type Habit,
  type HabitFrequencyType,
  type HabitTimeMode,
  type HabitWeekday,
  type HabitWeekdayTimes,
} from '../../types/habit'

const DEFAULT_WEEKDAYS: HabitWeekday[] = [1, 2, 3, 4, 5]
/** 週に◯回を選んだときの最初の回数 */
const DEFAULT_TIMES_PER_WEEK = 3

/** 習慣の色＝ラベル（記録のラベルと同じ色選び。名前の付いた色を選ぶと、その習慣の記録はそのラベルになる） */
const DEFAULT_HABIT_COLOR = hexForGoogleKey('sage')!

/** 習慣の追加・編集フォームの中身 */
export type HabitFormState = {
  /** 習慣 / ルーティン（毎日の予定のプリセット）。前の版の書きかけには無い（習慣） */
  kind?: 'habit' | 'routine'
  title: string
  freq: HabitFrequencyType
  /** 曜日を指定のときの曜日（ほかの頻度を選んでも残し、戻したときに使う） */
  weekdays: HabitWeekday[]
  /** 週に◯回のときの回数（1〜6。ほかの頻度を選んでも残す） */
  timesPerWeek: number
  timeMode: HabitTimeMode
  startTime: string
  endTime: string
  /** 曜日を指定した習慣で「曜日ごとに時間を変える」を押した */
  perWeekday: boolean
  /** 曜日ごとの時間（入れた曜日だけ。無い曜日は上の時間から始める。曜日を外しても残す） */
  weekdayTimes: Partial<Record<HabitWeekday, { startTime: string; endTime: string }>>
  /** 1 回の時間の目標（分）。空なら目標なし */
  goalMinutes: string
  color: string
}

export const EMPTY_HABIT_FORM: HabitFormState = {
  kind: 'habit',
  title: '',
  freq: 'daily',
  weekdays: DEFAULT_WEEKDAYS,
  timesPerWeek: DEFAULT_TIMES_PER_WEEK,
  // 時間は「時間を決める」を押してから（押すと 09:00〜10:00）
  timeMode: 'none',
  startTime: '09:00',
  endTime: '10:00',
  perWeekday: false,
  weekdayTimes: {},
  goalMinutes: '',
  color: DEFAULT_HABIT_COLOR,
}

/** 編集を始めたときのフォーム（その習慣の今の値） */
export function habitFormFrom(h: Habit): HabitFormState {
  return {
    kind: h.kind === 'routine' ? 'routine' : 'habit',
    title: h.title,
    freq: h.frequency.type,
    weekdays: h.frequency.type === 'weekly' ? [...h.frequency.weekdays].sort((a, b) => a - b) : DEFAULT_WEEKDAYS,
    timesPerWeek: h.frequency.type === 'timesPerWeek' ? h.frequency.count : DEFAULT_TIMES_PER_WEEK,
    timeMode: h.timeMode,
    startTime: h.startTime ?? '09:00',
    endTime: h.endTime ?? '10:00',
    perWeekday: !!h.weekdayTimes,
    weekdayTimes: Object.fromEntries(
      Object.entries(h.weekdayTimes ?? {}).map(([d, v]) => [d, { startTime: v.startTime, endTime: v.endTime ?? h.endTime ?? '10:00' }]),
    ),
    goalMinutes: h.goalMinutes ? String(h.goalMinutes) : '',
    color: h.color,
  }
}

/**
 * 種類に合わせた中身。ルーティンは時間帯だけ・毎日か曜日を指定だけ・時間の目標なし（ほかを選んでいた値は残し、習慣に戻したら使う）
 */
export function effectiveHabitForm(f: HabitFormState): HabitFormState {
  if (f.kind !== 'routine') return f
  return { ...f, timeMode: 'range', freq: f.freq === 'timesPerWeek' ? 'daily' : f.freq, goalMinutes: '' }
}

/** 時間の目標の欄の値。空は null（目標なし）、1〜1440 の整数でなければ NaN */
function formGoalMinutes(f: HabitFormState): number | null {
  const text = f.goalMinutes.trim()
  if (!text) return null
  const n = Number(text)
  return Number.isInteger(n) && n >= 1 && n <= HABIT_GOAL_MINUTES_MAX ? n : NaN
}

/** 曜日ごとの時間の欄を使うか（時間あり・「曜日ごとに時間を変える」を押した） */
export function usesWeekdayTimes(f: HabitFormState): boolean {
  return f.perWeekday && f.timeMode !== 'none'
}

const ALL_WEEKDAYS: HabitWeekday[] = [1, 2, 3, 4, 5, 6, 7]

/** 曜日ごとの時間の行を出す曜日（月曜から）。曜日を指定した習慣は選んだ曜日、ほかは 7 日とも */
export function formTimeDays(f: HabitFormState): HabitWeekday[] {
  return f.freq === 'weekly' ? [...f.weekdays].sort((a, b) => a - b) : ALL_WEEKDAYS
}

/** その曜日の欄の時間。まだ入れていない曜日は上の時間 */
export function formWeekdayTime(f: HabitFormState, d: HabitWeekday): { startTime: string; endTime: string } {
  return f.weekdayTimes[d] ?? { startTime: f.startTime, endTime: f.endTime }
}

/**
 * 「どの曜日も同じ時間にする」で戻すときの変更。出している曜日でいちばん多い時間（同じ数なら月曜に近い曜日の時間）を
 * 1 つの時間にし、曜日ごとの時間は捨てる（睡眠の予定の `commonSleepPlan` と同じ）
 */
export function sameTimeFormPatch(f: HabitFormState): Partial<HabitFormState> {
  const times = formTimeDays(f).map((d) => formWeekdayTime(f, d))
  const key = (w: { startTime: string; endTime: string }) => (f.timeMode === 'range' ? `${w.startTime}-${w.endTime}` : w.startTime)
  let best: { startTime: string; endTime: string } = f
  let bestCount = 0
  for (const w of times) {
    const count = times.filter((x) => key(x) === key(w)).length
    if (count > bestCount) {
      best = w
      bestCount = count
    }
  }
  return { perWeekday: false, startTime: best.startTime, endTime: best.endTime, weekdayTimes: {} }
}

/** 使わない時刻は空にして判定する（時刻なしなら開始・終了とも、決まった時刻なら終了を見ない） */
function draftFields(f: HabitFormState, times: { startTime: string; endTime: string } = f): HabitDraftFields {
  return {
    title: f.title,
    freq: f.freq,
    weekdays: f.weekdays,
    timesPerWeek: f.timesPerWeek,
    timeMode: f.timeMode,
    startTime: f.timeMode === 'none' ? '' : times.startTime,
    endTime: f.timeMode === 'range' ? times.endTime : '',
  }
}

/** 曜日ごとの時間なら、選んだ曜日の欄が全部そろっていること */
export function canSubmitHabitForm(form: HabitFormState): boolean {
  const f = effectiveHabitForm(form)
  if (Number.isNaN(formGoalMinutes(f))) return false
  if (!usesWeekdayTimes(f)) return canSubmitHabitDraft(draftFields(f))
  const days = formTimeDays(f)
  return days.length > 0 && days.every((d) => canSubmitHabitDraft(draftFields(f, formWeekdayTime(f, d))))
}

/**
 * ストアの addHabit / updateHabit に渡す値。曜日ごとの時間なら、選んだ曜日の時間を `weekdayTimes` に入れ、
 * 習慣の時間は最初の曜日の時間にする（使わなければ `weekdayTimes: undefined` で外す）
 */
export function habitFromForm(form: HabitFormState) {
  const f = effectiveHabitForm(form)
  const perWeekday = usesWeekdayTimes(f)
  const weekdays = formTimeDays(f)
  const base = perWeekday && weekdays.length > 0 ? formWeekdayTime(f, weekdays[0]) : f
  let weekdayTimes: HabitWeekdayTimes | undefined
  if (perWeekday) {
    weekdayTimes = {}
    for (const d of weekdays) {
      const w = formWeekdayTime(f, d)
      weekdayTimes[d] = { startTime: w.startTime, endTime: f.timeMode === 'range' ? w.endTime : null }
    }
  }
  return {
    title: f.title.trim(),
    color: f.color,
    timeMode: f.timeMode,
    startTime: f.timeMode === 'none' ? null : base.startTime,
    endTime: f.timeMode === 'range' ? base.endTime : null,
    frequency: habitFrequencyFromDraft(f.freq, f.weekdays, f.timesPerWeek),
    weekdayTimes,
    goalMinutes: formGoalMinutes(f) ?? undefined,
    kind: f.kind === 'routine' ? ('routine' as const) : undefined,
  }
}

/**
 * 閉じても書きかけを残すフォーム（`useDialogDraft`）。`key` は習慣ごとに分ける。
 * 返すのは中身・一部を変える `patch`・書きかけを捨てる `discard`（保存・キャンセルのとき）
 */
export function useHabitFormDraft(key: string, initial: HabitFormState | (() => HabitFormState)) {
  const [form, setForm, discard] = useDialogDraft(key, initial)
  const patch = useCallback((p: Partial<HabitFormState>) => setForm((f) => ({ ...f, ...p })), [setForm])
  return [form, patch, discard] as const
}
