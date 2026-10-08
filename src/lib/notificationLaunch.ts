/**
 * 通知を押して開いたときの動き（起動 URL・Service Worker のメッセージは `pwa.ts` が読む）。
 * - 開始前・締切 1 件: その To-Do・予定の詳細と、その日の今日の計画を開く
 */
import { useTaskStore } from '../store/taskStore'
import type { Task } from '../types/task'
import { openTaskDetail, useOverlays } from './overlays'
import { isActiveTask } from './taskLifecycle'
import { taskPlacementDate } from './taskTimeRange'
import { appTodayKey } from './timeZone'

/** 開いた時点で手元に無い件（別の端末で作った直後など）を、同期で届くまで待つ長さ */
export const TASK_LAUNCH_WAIT_MS = 15_000

/**
 * 詳細を開くときに見せる日。通知の日（予定の日・締切日）が今もその件の日ならそれ、
 * 通知のあとで日を動かしていたら今の日（予定の日、無ければ締切日）
 */
export function taskLaunchDate(task: Pick<Task, 'scheduledDate' | 'dueDate' | 'kind'>, hint: string | null): string | null {
  const placement = taskPlacementDate(task)
  if (hint && (hint === placement || hint === task.dueDate)) return hint
  return placement ?? task.dueDate ?? null
}

function findActive(taskId: string): Task | null {
  const task = useTaskStore.getState().tasks.find((t) => t.id === taskId)
  return task && isActiveTask(task) ? task : null
}

function reveal(task: Task, hint: string | null) {
  const s = useTaskStore.getState()
  s.selectView('planner')
  s.setSelectedCalendarDateKey(taskLaunchDate(task, hint) ?? appTodayKey())
  openTaskDetail(task.id)
}

let cancelWait: (() => void) | null = null

/**
 * 開始前・締切の通知から、その To-Do・予定の詳細を開く。消した・見つからない件は今日の計画（今日）を開く。
 * 手元にまだ無ければ、同期で届くまで少し待ってから開く（待つ間に別の画面・詳細を開いたらやめる）
 */
export function openTaskFromNotification(taskId: string, date: string | null, waitMs = TASK_LAUNCH_WAIT_MS) {
  cancelWait?.()
  const found = findActive(taskId)
  if (found) {
    reveal(found, date)
    return
  }
  const s = useTaskStore.getState()
  s.selectView('planner')
  s.setSelectedCalendarDateKey(appTodayKey())
  // 消した件（ごみ箱・アーカイブ）は待たない
  if (s.tasks.some((t) => t.id === taskId)) return
  const stopTasks = useTaskStore.subscribe((st, prev) => {
    if (st.selectedView !== 'planner' || st.selectedListId !== null) return done()
    if (st.tasks === prev.tasks) return
    const task = findActive(taskId)
    if (task) {
      done()
      reveal(task, date)
    }
  })
  const stopOverlay = useOverlays.subscribe((o) => {
    if (o.detailTaskId !== null) done()
  })
  const timer = setTimeout(() => done(), waitMs)
  function done() {
    clearTimeout(timer)
    stopTasks()
    stopOverlay()
    if (cancelWait === done) cancelWait = null
  }
  cancelWait = done
}
