import { addDays } from 'date-fns'
import type { Task } from '../types/task'
import { isActiveTask } from './taskLifecycle'
import { isListedTimeLog } from './timeLogTask'
import { isSleepRecord } from './sleep'
import { durationMinutesForTaskSlot, minutesOfLogOnCalendarDay, taskPlacementDate } from './taskTimeRange'
import { fromDateKey, toDateKey } from './dateKey'
import { appDayKeyOf } from './timeZone'

export interface DayPlan {
  /** 締切（期限日）が過ぎた未完了タスク。どの日に置いたかに関係なく、今日のリストの先頭に出す */
  overdue: Task[]
  /** 過去に置いたまま終わっていないルートタスク（締切切れは overdue へ） */
  carryOver: Task[]
  /** まだ先の日に置いてあるが、締切（期限日）が 3 日以内に来る未完了タスク（課題・ES など） */
  dueSoon: Task[]
  open: Task[]
  done: Task[]
  plannedMinutes: number
  loggedMinutes: number
}

/** 完了したタスクを出す日（完了した日。置いた日・締切より優先）。古い保存で完了時刻が無ければ最後に変えた日 */
export function completionDayKey(task: Pick<Task, 'completedAt' | 'updatedAt'>): string {
  return appDayKeyOf(task.completedAt ?? task.updatedAt)
}

/** 開始時刻つきを時刻順で先に、残りは元の並び順 */
function compareDayTasks(a: Task, b: Task): number {
  if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime)
  if (a.startTime) return -1
  if (b.startTime) return 1
  return a.order - b.order
}

const DUE_SOON_DAYS = 3

/** 「今日の計画」と日次リマインダーで共通の、その日（`yyyy-MM-dd`）の集計 */
export function getDayPlan(
  tasks: readonly Task[],
  dateKey: string,
  /** いつか / チェックリストのリスト。予定・締切の集計に入れない */
  excludedListIds: ReadonlySet<string> = new Set(),
): DayPlan {
  const overdue: Task[] = []
  const carryOver: Task[] = []
  const dueSoon: Task[] = []
  const dueSoonLimit = toDateKey(addDays(fromDateKey(dateKey), DUE_SOON_DAYS))
  const open: Task[] = []
  const done: Task[] = []
  let plannedMinutes = 0
  let loggedMinutes = 0
  for (const task of tasks) {
    if (!isActiveTask(task)) continue
    if (isListedTimeLog(task)) {
      // 睡眠は記録の時間に入れない（毎日 7〜8 時間で他の記録が見えなくなる）
      if (!isSleepRecord(task)) loggedMinutes += minutesOfLogOnCalendarDay(task, dateKey)
      continue
    }
    if (task.parentId || excludedListIds.has(task.listId)) continue
    const placed = taskPlacementDate(task)
    if (placed === dateKey && task.startTime && task.endTime) plannedMinutes += durationMinutesForTaskSlot(task) ?? 0
    if (task.completed) {
      // やった日が優先: 置いた日・締切ではなく、完了した日の「完了」に出す
      if (completionDayKey(task) === dateKey) done.push(task)
    } else if (placed === dateKey) {
      open.push(task)
    } else if (task.dueDate && task.dueDate < dateKey) {
      overdue.push(task)
    } else if (placed && placed < dateKey) {
      carryOver.push(task)
    } else if (placed && task.dueDate && task.dueDate > dateKey && task.dueDate <= dueSoonLimit) {
      dueSoon.push(task)
    }
  }
  open.sort(compareDayTasks)
  done.sort(compareDayTasks)
  overdue.sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
  carryOver.sort((a, b) => (taskPlacementDate(a) ?? '').localeCompare(taskPlacementDate(b) ?? ''))
  dueSoon.sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
  return { overdue, carryOver, dueSoon, open, done, plannedMinutes, loggedMinutes }
}

/**
 * 「今日やる候補」をスクロールで足していく分。やり残し・締切間近（getDayPlan）より後ろに並べる。
 * 締切がもっと先のもの（締切順）→ 日付なし（並び順）→ 先の日に置いたもの（日付順）。
 */
export function getMoreSuggestions(
  tasks: readonly Task[],
  dateKey: string,
  excludedListIds: ReadonlySet<string> = new Set(),
): Task[] {
  const dueSoonLimit = toDateKey(addDays(fromDateKey(dateKey), DUE_SOON_DAYS))
  const dueLater: Task[] = []
  const undated: Task[] = []
  const placedLater: Task[] = []
  for (const task of tasks) {
    if (!isActiveTask(task) || task.completed || isListedTimeLog(task)) continue
    if (task.parentId || excludedListIds.has(task.listId)) continue
    const placed = taskPlacementDate(task)
    if (placed === null) undated.push(task)
    else if (placed <= dateKey) continue
    // 締切切れは getDayPlan の overdue で先頭に出している
    else if (task.dueDate && task.dueDate < dateKey) continue
    else if (task.dueDate && task.dueDate > dueSoonLimit) dueLater.push(task)
    else if (!task.dueDate || task.dueDate === dateKey) placedLater.push(task)
  }
  dueLater.sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
  undated.sort((a, b) => a.order - b.order)
  placedLater.sort((a, b) => (taskPlacementDate(a) ?? '').localeCompare(taskPlacementDate(b) ?? ''))
  return [...dueLater, ...undated, ...placedLater]
}
