/**
 * 開いてすぐ記録を始める起動 URL（`?start=last`、ホーム画面のアイコン長押しの「前回の記録を再開」、#292）。
 *
 * - 前回の記録: 終わりがいちばん新しい記録（睡眠・ゴミ箱・アーカイブ・題名が空のものを除く）。
 *   題名・ラベル（`category`）・色・元の To-Do（`sourceTaskId`、元がまだあるときだけ）をそのまま写して始める
 * - すでに計測中（どの端末で始めたものでも）なら新しく始めず、そのタイマーを見せるだけ（二重に始めない）
 * - 記録がまだ 1 つも無ければ何も始めず、記録パネル（今日の計画）を開いて知らせる
 *
 * ログイン中は、ほかの端末で動いているタイマーと最新の記録を取り込んでから決める（最初の同期を待つ）。
 * 同期が失敗した・時間がかかるときは手元の内容で決める（あとで別の端末のタイマーと食い違えば、
 * `timerSync.ts` が後に始めたほうを残し、もう片方を記録にする）
 */
import type { ActiveTimer, TaskState } from '../store/storeTypes'
import type { SyncState } from '../types/sync'
import { isLogTask, isSleepTask, type Task } from '../types/task'
import { isActiveTask } from './taskLifecycle'

export type QuickStartRequest = 'last'

/** `?start=` の値を読む（`last` だけ。ほかは無視） */
export function parseStartParam(value: string | null): QuickStartRequest | null {
  return value?.trim().toLowerCase() === 'last' ? 'last' : null
}

/** 再開するタイマーの中身（`startTimer` に渡す） */
export interface ResumeSeed {
  title: string
  tags: string[]
  taskId: string | null
  color: string | null
}

/** 記録の終わり（日付が変わる記録は終わりの日）。並べ替え用 */
function logEndStamp(t: Task): string {
  return `${t.endDate ?? t.dueDate ?? ''} ${t.endTime ?? t.startTime ?? ''} ${t.dueDate ?? ''} ${t.startTime ?? ''} ${t.createdAt}`
}

/** 前回の記録（終わりがいちばん新しい記録）から、再開するタイマーの中身を作る。無ければ null */
export function lastLogSeed(tasks: readonly Task[]): ResumeSeed | null {
  let last: Task | null = null
  for (const t of tasks) {
    if (!isLogTask(t) || isSleepTask(t) || !isActiveTask(t) || !t.title.trim()) continue
    if (!last || logEndStamp(t) > logEndStamp(last)) last = t
  }
  if (!last) return null
  const source = last.sourceTaskId ? tasks.find((t) => t.id === last.sourceTaskId) : null
  return {
    title: last.title,
    tags: last.category ? [last.category] : [],
    taskId: source && isActiveTask(source) ? source.id : null,
    color: last.color ?? null,
  }
}

export type QuickStartResult = { kind: 'running'; title: string } | { kind: 'started'; title: string } | { kind: 'none' }

/** `?start=last` を実行する。計測中なら何もしない */
export function runQuickStart(store: Pick<TaskState, 'tasks' | 'startTimer'> & { activeTimer: ActiveTimer | null }): QuickStartResult {
  if (store.activeTimer) return { kind: 'running', title: store.activeTimer.taskTitle }
  const seed = lastLogSeed(store.tasks)
  if (!seed) return { kind: 'none' }
  store.startTimer(seed.title, seed.tags, seed.taskId, seed.color)
  return { kind: 'started', title: seed.title }
}

/** ログイン中に最初の同期を待つ上限（回線が無いときに始まらないままにしない） */
export const QUICK_START_SYNC_WAIT_MS = 6000

/** もう決めてよいか（ログインの確認が済み、ログイン中なら最初の同期が終わった・失敗した・待ちきれない） */
export function quickStartReady(p: {
  authLoading: boolean
  signedIn: boolean
  lastSyncedAt: string | null
  syncState: SyncState
  timedOut: boolean
}): boolean {
  if (p.authLoading) return p.timedOut
  if (!p.signedIn) return true
  return p.lastSyncedAt !== null || p.syncState === 'error' || p.syncState === 'limit' || p.syncState === 'outdated' || p.timedOut
}

let pending: QuickStartRequest | null = null

/** 起動 URL で頼まれた（画面を描く前に `consumeLaunch` から） */
export function requestQuickStart(request: QuickStartRequest) {
  pending = request
}

export function hasPendingQuickStart(): boolean {
  return pending !== null
}

/** 頼まれていたものを取り出す（1 回だけ。StrictMode で effect が 2 回走っても二重に始めない） */
export function takeQuickStart(): QuickStartRequest | null {
  const r = pending
  pending = null
  return r
}
