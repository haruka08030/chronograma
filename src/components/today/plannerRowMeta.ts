import { differenceInCalendarDays } from 'date-fns'
import type { TFunction } from 'i18next'
import type { Task } from '../../types/task'
import { fromDateKey } from '../../lib/dateKey'
import { planTiming } from '../../lib/planTiming'
import { DUE_TONE_CLASS } from '../ui/dueTone'
import { dueToneOf } from '../../lib/dueTone'

export const META_TONE_CLASS = {
  muted: DUE_TONE_CLASS.past,
  overdue: DUE_TONE_CLASS.overdue,
  today: DUE_TONE_CLASS.today,
  tomorrow: DUE_TONE_CLASS.tomorrow,
} as const

/**
 * 行の締切の出し方:
 * - `all`: やり残し。締切が選ぶ材料なので全部出す
 * - `urgent`: 今日やると決めた行。過ぎた締切と今日の締切（明日へ回せない）だけ。先の締切は決めたあとでは何も変えない
 * - `date`: 候補の「締切が先」。見出しが締切と言っているので日付だけ
 * - `none`: 候補の日ごとのまとまり。見出しに締切の日があるので出さない
 */
export type DueMode = 'all' | 'urgent' | 'date' | 'none'

export type DueMeta = { text: string; tone: keyof typeof META_TONE_CLASS } | null

/** 見ている日（締切・時刻の比べ先） */
export type PlannerDay = {
  dateKey: string
  date: Date
  tomorrowKey: string
  now: Date
  t: TFunction
  shortDate: (key: string) => string
}

/** 締切: 過ぎていれば「3日遅れ」、今日なら「今日まで」か「18:00 まで」、明日は薄いオレンジ */
export function dueMeta(task: Task, day: PlannerDay): DueMeta {
  const { dateKey, date, now, t, shortDate } = day
  if (!task.dueDate) return null
  const tone = dueToneOf(task.dueDate, task.dueTime, dateKey, { now })
  if (task.dueDate === dateKey) {
    return { text: task.dueTime ? t('planner.dueAt', { time: task.dueTime }) : t('planner.dueToday'), tone: tone === 'overdue' ? 'overdue' : 'today' }
  }
  if (task.dueDate < dateKey) {
    return { text: t('planner.dueLate', { count: differenceInCalendarDays(date, fromDateKey(task.dueDate)) }), tone: 'overdue' }
  }
  return { text: t('planner.dueOn', { date: shortDate(task.dueDate) }), tone: tone === 'overdue' || tone === 'tomorrow' ? tone : 'muted' }
}

/**
 * 行の右端: 時刻があれば時刻、締切があれば締切（`mode` で出し方を変える）。
 * 予定の時間が過ぎても終わっていなければ時刻も赤くする
 */
export function rowMeta(task: Task, mode: DueMode, day: PlannerDay): { time: string | null; timeOver: boolean; due: DueMeta } {
  const timed = Boolean(task.startTime && task.endTime && task.scheduledDate === day.dateKey)
  const dueAll = dueMeta(task, day)
  const due =
    mode === 'none'
      ? null
      : mode === 'date' && task.dueDate
        ? { text: day.shortDate(task.dueDate), tone: 'muted' as const }
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
