/**
 * 通知を押して開いたときの動き（起動 URL・Service Worker のメッセージは `pwa.ts` が読む）。
 * - 開始前・締切 1 件: その To-Do・予定の詳細と、その日の今日の計画を開く
 * - 止め忘れの「止める」: そのタイマーを止め、できた記録の詳細を開く（終わりの時刻を直せる）
 */
import { useTaskStore } from '../store/taskStore'
import { isLogTask, type Task } from '../types/task'
import { openTaskDetail, useOverlays } from './overlays'
import { isActiveTask } from './taskLifecycle'
import { taskPlacementDate } from './taskTimeRange'
import { appTodayKey } from './timeZone'
import { onActiveTimerSynced } from './timerSync'

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

/** 「止める」で、動いているタイマーの同期を待つ上限（オフライン・同期が始まらないときはそのあと手元のタイマーで決める） */
export const TIMER_STOP_WAIT_MS = 10_000

/**
 * 止め忘れの通知の「止める」。そのタイマー（開始時刻が同じもの）を止め、できた記録の詳細を開く。
 * 3 時間以上気づかずに動いていたことが多いので、止めた時刻のままにせず、詳細で終わりの時刻を直せるようにする。
 * ログイン中は、別の端末で止めた古いタイマーを止めて記録が 2 本にならないよう、タイマーの同期を 1 回待ってから決める。
 * もう止まっている・別のタイマーが動いているときは止めずに知らせる
 */
export function stopTimerFromNotification(startedAt: string | null, waitMs = TIMER_STOP_WAIT_MS) {
  useTaskStore.getState().selectView('planner')
  const run = () => {
    const s = useTaskStore.getState()
    const timer = s.activeTimer
    if (!timer || (startedAt !== null && Date.parse(timer.startedAt) !== Date.parse(startedAt))) {
      s.showMoveBanner({ key: 'reminders.timerAlreadyStopped' })
      return
    }
    const before = new Set(s.tasks.map((t) => t.id))
    s.stopTimer()
    const log = useTaskStore.getState().tasks.find((t) => !before.has(t.id) && isLogTask(t))
    if (log) openTaskDetail(log.id)
  }
  if (useTaskStore.getState().dataOwner === null) {
    run()
    return
  }
  let settled = false
  const settle = () => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    off()
    run()
  }
  const off = onActiveTimerSynced(settle)
  const timer = setTimeout(settle, waitMs)
}
