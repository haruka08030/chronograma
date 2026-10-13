/**
 * ▶ の記録の「あと何分」（集中タイマー、#290）。終わりの時刻を付けると、浮いているタイマーは残り時間になり、
 * 時間になったら知らせる（`timerEndAlert.ts`・Web Push の `daily-reminders`）。記録は止めない（延長して続けるのが普通なので）。
 * 記録はふつうの記録 1 本のまま（休憩・セットは持たない）
 */
import { addDays } from 'date-fns'
import type { ActiveTimer } from '../store/storeTypes'
import { isEventTask, isTodoTask, type Task } from '../types/task'
import { taskPlacementDate } from './taskTimeRange'
import { appTimeZone, instantFromWall } from './timeZone'
import { fromDateKey, toDateKey } from './dateKey'

/** 選べる長さ（分）。1 コマ 90 分・ポモドーロ 25 分のように区切って勉強する使い方 */
export const TIMER_LENGTH_CHOICES = [25, 50, 90] as const

/** 終わりの時刻の上限（始めてから。DB の `user_active_timer_ends_at_check` と同じ） */
export const MAX_TIMER_LENGTH_MS = 24 * 60 * 60_000

/** 終わりの時刻をそろえる（ISO の UTC）。始めた時刻より後で 1 日以内でなければ null */
export function normalizeEndsAt(endsAt: unknown, startedAt: string): string | null {
  if (typeof endsAt !== 'string') return null
  const end = Date.parse(endsAt)
  const start = Date.parse(startedAt)
  if (!Number.isFinite(end) || !Number.isFinite(start) || end <= start || end - start > MAX_TIMER_LENGTH_MS) return null
  return new Date(end).toISOString()
}

/** 今から `minutes` 分後の終わりの時刻（秒は切り捨てない。選んだ瞬間からちょうど N 分） */
export function endsAfter(minutes: number, nowMs: number = Date.now()): string {
  return new Date(nowMs + minutes * 60_000).toISOString()
}

/**
 * 予定ブロック・時刻のある To-Do から ▶ したとき、その予定の終わり（ISO）。まだ来ていない終わりだけ（予定どおり終える助け）。
 * 終わりの時刻はアプリのタイムゾーンの壁時計。0:00 終わり（日付の書かれていないもの）は翌日の 0:00
 */
export function planEndFor(timer: ActiveTimer, tasks: readonly Task[], nowMs: number = Date.now()): string | null {
  if (!timer.taskId) return null
  const task = tasks.find((t) => t.id === timer.taskId)
  if (!task || (!isTodoTask(task) && !isEventTask(task)) || !task.startTime || !task.endTime) return null
  const date = taskPlacementDate(task)
  if (!date) return null
  let endDate = task.endDate ?? date
  if (!task.endDate && task.endTime <= task.startTime) endDate = toDateKey(addDays(fromDateKey(date), 1))
  const end = instantFromWall(endDate, task.endTime, appTimeZone())
  if (!Number.isFinite(end) || end <= nowMs) return null
  return normalizeEndsAt(new Date(end).toISOString(), timer.startedAt)
}
