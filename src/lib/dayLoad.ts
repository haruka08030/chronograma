import { isEventTask, isLogTask, type Task } from '../types/task'
import type { CalendarEvent } from '../types/calendarEvent'
import { isActiveTask } from './taskLifecycle'
import { durationMinutesForTaskSlot, taskPlacementDate } from './taskTimeRange'
import { busyMinutes, commitmentSpans } from './freeSlots'
import { addDays } from 'date-fns'
import { fromDateKey, toDateKey } from './dateKey'

/** その日の空き時間と、その日にやると置いた To-Do の時間 */
export interface DayLoad {
  /** 空き（分）= 1 日に使える時間 − 授業・バイト・Google の予定（重なりは 1 回）。0 より小さくしない */
  freeMinutes: number
  /** その日に置いた To-Do の時間（分）。時刻つきはその長さ、時刻なしは見積もり（見積もりの無いものは数えない） */
  plannedMinutes: number
  /** 置いた To-Do が空きに入りきらない */
  over: boolean
}

/**
 * その日（`yyyy-MM-dd`）に置いた To-Do の時間。今日の計画の「予定」と同じものを数える:
 * 記録・予定（授業・バイト）・いつか / チェックリストのリストは入れない（サブタスクはその日に置いたものだけ、`isDayPlanTask`）
 */
export function plannedTodoMinutes(tasks: readonly Task[], dateKey: string, excludedListIds: ReadonlySet<string> = new Set()): number {
  let total = 0
  for (const task of tasks) {
    if (!isActiveTask(task) || isLogTask(task) || isEventTask(task)) continue
    if (excludedListIds.has(task.listId)) continue
    if (taskPlacementDate(task) !== dateKey) continue
    total += (task.startTime && task.endTime ? durationMinutesForTaskSlot(task) : task.estimateMinutes) ?? 0
  }
  return total
}

/** その日の空き時間（分）。目安から、その日の動かせない予定でふさがっている時間を引く */
export function freeMinutesOfDay(
  tasks: readonly Task[],
  events: readonly CalendarEvent[],
  dateKey: string,
  capacityMinutes: number,
): number {
  return Math.max(0, capacityMinutes - busyMinutes(commitmentSpans(tasks, events, dateKey)))
}

/** その日の空きと置いた To-Do を比べる（週表示の各日の見出し） */
export function dayLoad(
  tasks: readonly Task[],
  events: readonly CalendarEvent[],
  dateKey: string,
  { capacityMinutes, excludedListIds }: { capacityMinutes: number; excludedListIds?: ReadonlySet<string> },
): DayLoad {
  const freeMinutes = freeMinutesOfDay(tasks, events, dateKey, capacityMinutes)
  const plannedMinutes = plannedTodoMinutes(tasks, dateKey, excludedListIds)
  return { freeMinutes, plannedMinutes, over: plannedMinutes > freeMinutes }
}

/** 締切の見出しの「入りきらない」に使う、そこまでの見積もりと空き（分） */
export interface DueFit {
  estimateMinutes: number
  freeMinutes: number
  /** 見積もりが空きに入りきらない */
  over: boolean
}

/** 締切の日（`dueDate`）までに使える日: 今日から締切の前日まで（今日・明日までの締切は今日だけ） */
export function daysBeforeDue(todayKey: string, dueDate: string): string[] {
  const out: string[] = []
  for (let d = fromDateKey(todayKey); toDateKey(d) < dueDate || out.length === 0; d = addDays(d, 1)) out.push(toDateKey(d))
  return out
}

/**
 * 今日やる候補の締切の見出しごとに、見積もりが締切までの空きに入りきるか（#332）。
 * 見積もりはその締切までのまとまり（それより前の締切の見出しも含む）の見積もりの合計（見積もりの無い行は数えない）。
 * 空きは今日から締切の前日までの各日の空き（`freeMinutesOfDay`、#303 と同じ数え方）の合計。
 * `groups` は締切の早い順。見積もりが 0 のまとまりは入りきるとみなす
 */
export function dueFits(
  groups: readonly { dueDate: string; tasks: readonly Pick<Task, 'estimateMinutes'>[] }[],
  todayKey: string,
  freeOf: (dateKey: string) => number,
): Map<string, DueFit> {
  const out = new Map<string, DueFit>()
  let estimate = 0
  for (const g of groups) {
    estimate += g.tasks.reduce((a, t) => a + (t.estimateMinutes ?? 0), 0)
    const free = daysBeforeDue(todayKey, g.dueDate).reduce((a, k) => a + freeOf(k), 0)
    out.set(g.dueDate, { estimateMinutes: estimate, freeMinutes: free, over: estimate > 0 && estimate > free })
  }
  return out
}
