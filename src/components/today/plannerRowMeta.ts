import type { TFunction } from 'i18next'
import type { Task } from '../../types/task'
import { planTiming } from '../../lib/planTiming'
import { DUE_TONE_CLASS, SCHEDULED_TONE_CLASS, type DateTone } from '../ui/dueTone'
import { dueDateLabel } from '../ui/dueDateLabel'

export const META_TONE_CLASS = {
  muted: DUE_TONE_CLASS.past,
  overdue: DUE_TONE_CLASS.overdue,
  today: DUE_TONE_CLASS.today,
  tomorrow: DUE_TONE_CLASS.tomorrow,
  /** 時間が過ぎて終わっていない予定の時刻。責める赤は締切だけなので、過ぎた実行日と同じ灰色 */
  passed: SCHEDULED_TONE_CLASS.overdue,
} as const

/**
 * 行の締切の出し方:
 * - `all`: やり残し。締切が選ぶ材料なので全部出す
 * - `urgent`: 今日やると決めた行。過ぎた締切と今日の締切（明日へ回せない）だけ。先の締切は決めたあとでは何も変えない
 * - `date`: 候補の「締切が先」。見出しが締切と言っているので日付だけ
 * - `none`: 候補の日ごとのまとまり。見出しに締切の日があるので出さない
 */
export type DueMode = 'all' | 'urgent' | 'date' | 'none'

/** 締切の印（`DueChip` に渡す文字と色） */
export type DueMeta = { text: string; tone: DateTone } | null

/** 見ている日（締切・時刻の比べ先） */
export type PlannerDay = {
  dateKey: string
  date: Date
  tomorrowKey: string
  now: Date
  t: TFunction
  language: string | undefined
  shortDate: (key: string) => string
}

/** 締切: To-Do の行と同じ `dueDateLabel`（「今日まで」「10/5 (月)まで・3日遅れ」「あと 2 日」）を、見ている日と比べて */
export function dueMeta(task: Task, day: PlannerDay): DueMeta {
  if (!task.dueDate) return null
  return dueDateLabel(task.dueDate, task.dueTime, day.t, day.language, { dayKey: day.dateKey, now: day.now })
}

/**
 * 行の右端: 時刻があれば時刻、締切があれば締切（`mode` で出し方を変える）。
 * 予定の時間が過ぎても終わっていなければ時刻を過ぎた実行日と同じ灰色にする（赤は締切だけ）
 */
export function rowMeta(task: Task, mode: DueMode, day: PlannerDay): { time: string | null; timeOver: boolean; due: DueMeta } {
  const timed = Boolean(task.startTime && task.endTime && task.scheduledDate === day.dateKey)
  const dueAll = dueMeta(task, day)
  const due =
    mode === 'none'
      ? null
      : mode === 'date' && task.dueDate
        ? { text: day.shortDate(task.dueDate), tone: 'past' as const }
        : mode === 'urgent' && dueAll && dueAll.tone !== 'overdue' && dueAll.tone !== 'today'
          ? null
          : dueAll
  if (!timed) return { time: null, timeOver: false, due }
  return {
    time: `${task.startTime}–${task.endTime}`,
    timeOver: planTiming(task, day.now).ended,
    due,
  }
}
