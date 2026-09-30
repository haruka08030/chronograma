import { addDays, format, parseISO } from 'date-fns'
import type { Task } from '../types/task'
import { isActiveTask } from './taskLifecycle'
import { isListedTimeLog } from './timeLogTask'
import { durationMinutesForTaskSlot, minutesOfLogOnCalendarDay, taskPlacementDate } from './taskTimeRange'

export interface DayPlan {
  /** 過去に置いたまま終わっていないルートタスク */
  carryOver: Task[]
  /** まだ先の日に置いてあるが、締切（期限日）が 3 日以内に来る未完了タスク（課題・ES など） */
  dueSoon: Task[]
  open: Task[]
  done: Task[]
  plannedMinutes: number
  loggedMinutes: number
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
  const carryOver: Task[] = []
  const dueSoon: Task[] = []
  const dueSoonLimit = format(addDays(parseISO(`${dateKey}T12:00:00`), DUE_SOON_DAYS), 'yyyy-MM-dd')
  const open: Task[] = []
  const done: Task[] = []
  let plannedMinutes = 0
  let loggedMinutes = 0
  for (const task of tasks) {
    if (!isActiveTask(task)) continue
    if (isListedTimeLog(task)) {
      loggedMinutes += minutesOfLogOnCalendarDay(task, dateKey)
      continue
    }
    if (task.parentId || excludedListIds.has(task.listId)) continue
    const placed = taskPlacementDate(task)
    if (placed === dateKey) {
      if (task.startTime && task.endTime) plannedMinutes += durationMinutesForTaskSlot(task) ?? 0
      if (task.completed) done.push(task)
      else open.push(task)
    } else if (placed && placed < dateKey && !task.completed) {
      carryOver.push(task)
    } else if (placed && !task.completed && task.dueDate && task.dueDate > dateKey && task.dueDate <= dueSoonLimit) {
      dueSoon.push(task)
    }
  }
  open.sort(compareDayTasks)
  done.sort(compareDayTasks)
  carryOver.sort((a, b) => (taskPlacementDate(a) ?? '').localeCompare(taskPlacementDate(b) ?? ''))
  dueSoon.sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
  return { carryOver, dueSoon, open, done, plannedMinutes, loggedMinutes }
}
