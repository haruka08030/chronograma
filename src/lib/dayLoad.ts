import { isEventTask, isLogTask, type Task } from '../types/task'
import type { CalendarEvent } from '../types/calendarEvent'
import { isActiveTask } from './taskLifecycle'
import { durationMinutesForTaskSlot, taskPlacementDate } from './taskTimeRange'
import { busyMinutes, commitmentSpans } from './freeSlots'

/** その日の空き時間と、その日にやると置いた To-Do の時間 */
export interface DayLoad {
  /** 空き（分）= 1 日に計画する時間の目安 − 授業・バイト・Google の予定（重なりは 1 回）。0 より小さくしない */
  freeMinutes: number
  /** その日に置いた To-Do の時間（分）。時刻つきはその長さ、時刻なしは見積もり（見積もりの無いものは数えない） */
  plannedMinutes: number
  /** 置いた To-Do が空きに入りきらない */
  over: boolean
}

/**
 * その日（`yyyy-MM-dd`）に置いた To-Do の時間。今日の計画の「予定」と同じものを数える:
 * 記録・予定（授業・バイト）・サブタスク・いつか / チェックリストのリストは入れない
 */
export function plannedTodoMinutes(tasks: readonly Task[], dateKey: string, excludedListIds: ReadonlySet<string> = new Set()): number {
  let total = 0
  for (const task of tasks) {
    if (!isActiveTask(task) || isLogTask(task) || isEventTask(task)) continue
    if (task.parentId || excludedListIds.has(task.listId)) continue
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
