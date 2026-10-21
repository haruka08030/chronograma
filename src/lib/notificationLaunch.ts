/**
 * 通知を押して開いたときの動き（起動 URL・Service Worker のメッセージは `pwa.ts` が読む）。
 * - 開始前・締切 1 件: その To-Do・予定の詳細と、その日の今日の計画を開く
 * - 止め忘れの「止める」: そのタイマーを止め、できた記録の詳細を開く（終わりの時刻を直せる）
 * - 開始の通知の「記録を始める」: その予定のタイマーを ▶ と同じく始める（#419）
 * - 夜の締め: 今日の計画の「1 日を締める」の所を見せる
 */
import { useTaskStore } from '../store/taskStore'
import { isLogTask, type Task } from '../types/task'
import { openTaskDetail, useOverlays } from './overlays'
import { isActiveTask } from './taskLifecycle'
import { taskPlacementDate } from './taskTimeRange'
import { appTodayKey } from './timeZone'
import { onActiveTimerSynced } from './activeTimerSynced'
import { canStartTimerFor, startTimerForTask } from './timerDrop'
import { askConfirm } from './confirmDialog'
import { planEndMs } from '../../supabase/functions/daily-reminders/schedule.ts'
import { toReminderTask } from './localReminders'
import { zonedNow } from './timeZone'
import i18n from '../i18n/config'

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

/** 予定の終わりを過ぎたか（アプリのタイムゾーンの壁時計で。終わりの無い予定は過ぎない） */
export function planHasEnded(task: Task, now: Date = zonedNow()): boolean {
  const end = planEndMs(toReminderTask(task))
  if (end == null) return false
  const nowWall = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds())
  return nowWall >= end
}

/** 手元にその件が届くまで待つ（ログインしていなければ待たない）。届かなければ null */
function waitForTask(taskId: string, waitMs: number): Promise<Task | null> {
  const found = findActive(taskId)
  if (found || useTaskStore.getState().dataOwner === null) return Promise.resolve(found)
  return new Promise((resolve) => {
    const off = useTaskStore.subscribe((st, prev) => {
      if (st.tasks === prev.tasks) return
      const task = findActive(taskId)
      if (task) finish(task)
    })
    const timer = setTimeout(() => finish(null), waitMs)
    function finish(task: Task | null) {
      clearTimeout(timer)
      off()
      resolve(task)
    }
  })
}

/** ほかの端末で動いているタイマーが届くまで待つ（ログインしていなければ待たない） */
function waitForTimerSync(waitMs: number): Promise<void> {
  if (useTaskStore.getState().dataOwner === null) return Promise.resolve()
  return new Promise((resolve) => {
    const off = onActiveTimerSynced(finish)
    const timer = setTimeout(finish, waitMs)
    function finish() {
      clearTimeout(timer)
      off()
      resolve()
    }
  })
}

/**
 * 開始の通知の「記録を始める」（#419）: 今日の計画を開き、その予定のタイマーを ▶ と同じく始める（`startTimerForTask`。元の予定の id を持つ）。
 * - 予定の終わりを過ぎていた・済んでいたら始めず、詳細を開く
 * - 別のタイマーが動いていたら、確かめてから切り替える（前のタイマーは記録にして閉じる）。同じ予定ならそのまま
 * - 手元にまだ無い件・ほかの端末のタイマーは、同期で届くまで少し待つ
 */
export async function startTimerFromNotification(taskId: string, date: string | null, waitMs = TASK_LAUNCH_WAIT_MS): Promise<void> {
  cancelWait?.()
  const s = useTaskStore.getState()
  s.selectView('planner')
  s.setSelectedCalendarDateKey(appTodayKey())
  const [task] = await Promise.all([waitForTask(taskId, waitMs), waitForTimerSync(TIMER_STOP_WAIT_MS)])
  if (!task) return
  if (!canStartTimerFor(task) || planHasEnded(task)) {
    reveal(task, date)
    return
  }
  const running = useTaskStore.getState().activeTimer
  if (running?.taskId === task.id) return
  if (running) {
    const ok = await askConfirm({
      message: i18n.t('reminders.switchTimerConfirm', { current: running.taskTitle, next: task.title }),
      confirmLabel: i18n.t('reminders.switchTimer'),
    })
    if (!ok) return
  }
  startTimerForTask(task.id)
}

/** 夜の締めの通知から開いた印（今日の計画がまだ描かれていなければ、描いたときに受け取る） */
let wrapUpPending = false
const wrapUpListeners = new Set<() => void>()

/**
 * 夜の締めの通知（#299）を押したとき: 今日の計画（今日）を開き、「1 日を締める」の所を見せる。
 * 今日の計画が描かれていれば `onWrapUpRequest` の関数をすぐ呼び、まだなら描いたときに呼ぶ
 */
export function openWrapUpFromNotification() {
  const s = useTaskStore.getState()
  s.selectView('planner')
  s.setSelectedCalendarDateKey(appTodayKey())
  wrapUpPending = true
  for (const fn of [...wrapUpListeners]) fn()
}

/** 「1 日を締める」を見せる頼みを受け取る（今日の計画）。前に来ていた頼みもここで受け取る。戻り値で受け取りをやめる */
export function onWrapUpRequest(fn: () => void): () => void {
  const listener = () => {
    if (!wrapUpPending) return
    wrapUpPending = false
    fn()
  }
  wrapUpListeners.add(listener)
  listener()
  return () => {
    wrapUpListeners.delete(listener)
  }
}
