import type { Task } from '../types/task'
import { isActiveTask } from './taskLifecycle'
import { isListedTimeLog } from './timeLogTask'
import { durationMinutesForTaskSlot, minutesOfLogOnCalendarDay, taskPlacementDate } from './taskTimeRange'

export interface DayPlan {
  /** 過去に置いたまま終わっていないルートタスク */
  carryOver: Task[]
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

/** 「今日の計画」と日次リマインダーで共通の、その日（`yyyy-MM-dd`）の集計 */
export function getDayPlan(tasks: readonly Task[], dateKey: string): DayPlan {
  const carryOver: Task[] = []
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
    if (task.parentId) continue
    const placed = taskPlacementDate(task)
    if (placed === dateKey) {
      if (task.startTime && task.endTime) plannedMinutes += durationMinutesForTaskSlot(task) ?? 0
      if (task.completed) done.push(task)
      else open.push(task)
    } else if (placed && placed < dateKey && !task.completed) {
      carryOver.push(task)
    }
  }
  open.sort(compareDayTasks)
  done.sort(compareDayTasks)
  carryOver.sort((a, b) => (taskPlacementDate(a) ?? '').localeCompare(taskPlacementDate(b) ?? ''))
  return { carryOver, open, done, plannedMinutes, loggedMinutes }
}
