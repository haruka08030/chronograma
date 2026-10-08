/**
 * 動いているタイマーの同期（#301）。サーバーには利用者ごとに 1 行（`user_active_timer`、`019`）。
 * PC で始めたタイマーがスマホの記録パネル・フローティングタイマーに出て、どちらからでも止められる。
 * 止めた端末が記録を作り（記録はタスクとして同期する）、ほかの端末はタイマーが消えるだけ（記録は 1 本）。
 *
 * どちらに合わせるかは `settingSync.ts` と同じ（サーバーの版と、手元で変えたか）。違うのは両方で変えていたとき:
 * - 片方が止めた・片方が動いている: 動いているほう（知らずに止めたことで、見ていないタイマーを消さない）
 * - 両方で知らずに別々のタイマーを始めた: 始めた時刻が後のほう（同じなら中身を並べて大きいほう。どの端末でも同じ答え）。
 *   負けたほうは勝ったほうを始めた時刻までの記録にする（▶ の切り替え `startTimer` と同じ）。記録を作るのは、
 *   食い違いに気づいた端末だけ（勝ったほうを送れた後・負けて合わせた後）。もう片方の端末はサーバーに合わせるだけ
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActiveTimer } from '../store/storeTypes'
import { pushSettingRow } from './supabaseData'
import { settingSyncStep, type SettingPushResult, type SettingSyncDeps } from './settingSync'

export type RemoteActiveTimer = { timer: ActiveTimer | null; updatedAt: string }
export type LocalActiveTimer = {
  timer: ActiveTimer | null
  /** 手元でタイマーを始めた・止めた時刻（`activeTimerUpdatedAt`）。この端末でまだ一度も変えていなければ null */
  updatedAt: string | null
  /** 手元の値のもとになったサーバーの版（`settingSync.ts`）。まだ無ければ null */
  syncedAt?: string | null
}
/** 知らずに 2 つ動いていたときの負けたほうと、記録の終わり（勝ったほうを始めた時刻） */
export type TimerHandoff = { timer: ActiveTimer; endedAt: string }

export type ActiveTimerSyncPlan = {
  /** 手元をこのタイマーにする。`record` があれば先に記録にする */
  apply?: { timer: ActiveTimer | null; updatedAt: string; record?: TimerHandoff }
  /** サーバーに送る。`base` はもとにしたサーバーの版（行が無ければ null）。`record` は送れたら記録にする */
  push?: RemoteActiveTimer & { base: string | null; record?: TimerHandoff }
  adopt?: string
}

/** サーバー・保存から読んだタイマーをそろえる（時刻は ISO の UTC、無い項目は null） */
export function normalizeActiveTimer(raw: unknown): ActiveTimer | null {
  const x = raw as Partial<ActiveTimer> | null | undefined
  if (!x || typeof x.taskTitle !== 'string' || typeof x.startedAt !== 'string') return null
  const ms = Date.parse(x.startedAt)
  if (!Number.isFinite(ms)) return null
  return {
    taskTitle: x.taskTitle,
    startedAt: new Date(ms).toISOString(),
    tags: Array.isArray(x.tags) ? x.tags.filter((t): t is string => typeof t === 'string') : [],
    taskId: typeof x.taskId === 'string' ? x.taskId : null,
    color: typeof x.color === 'string' ? x.color : null,
  }
}

const timerKey = (t: ActiveTimer | null) => {
  const n = normalizeActiveTimer(t)
  return n ? JSON.stringify([n.startedAt, n.taskTitle, n.tags, n.taskId, n.color]) : ''
}

export const sameActiveTimer = (a: ActiveTimer | null, b: ActiveTimer | null) => timerKey(a) === timerKey(b)

/** a のほうが後に始めたか（同じ時刻なら中身を並べて大きいほう） */
function startedLater(a: ActiveTimer, b: ActiveTimer): boolean {
  const d = Date.parse(a.startedAt) - Date.parse(b.startedAt)
  return d !== 0 ? d > 0 : timerKey(a) > timerKey(b)
}

export function planActiveTimerSync(
  local: LocalActiveTimer,
  remote: RemoteActiveTimer | null,
  nowIso: string = new Date().toISOString(),
  clockOffsetMs = 0,
): ActiveTimerSyncPlan {
  const mine = normalizeActiveTimer(local.timer)
  const updatedAt = local.updatedAt ?? nowIso
  if (!remote) return { push: { timer: mine, updatedAt, base: null } }
  const theirs = normalizeActiveTimer(remote.timer)
  const same = sameActiveTimer(mine, theirs)
  const syncedAt = local.syncedAt ?? null
  // 両方で変えた（またはこの端末でもとにした版が分からない）
  const conflict = local.updatedAt === null || syncedAt === null || (local.updatedAt !== syncedAt && remote.updatedAt !== syncedAt)
  if (!conflict || same) {
    const step = settingSyncStep({ updatedAt: local.updatedAt, syncedAt }, remote, same, clockOffsetMs)
    switch (step.kind) {
      case 'initial':
      case 'apply':
        return { apply: { timer: theirs, updatedAt: remote.updatedAt } }
      case 'push':
        return { push: { timer: mine, updatedAt, base: step.base } }
      case 'adopt':
        return { adopt: remote.updatedAt }
      default:
        return {}
    }
  }
  if (!mine) return { apply: { timer: theirs, updatedAt: remote.updatedAt } }
  if (!theirs) return { push: { timer: mine, updatedAt, base: remote.updatedAt } }
  if (startedLater(mine, theirs)) {
    return { push: { timer: mine, updatedAt, base: remote.updatedAt, record: { timer: theirs, endedAt: mine.startedAt } } }
  }
  return { apply: { timer: theirs, updatedAt: remote.updatedAt, record: { timer: mine, endedAt: theirs.startedAt } } }
}

interface ActiveTimerRow {
  started_at: string | null
  task_title: string | null
  tags: unknown
  task_id: string | null
  color: string | null
  updated_at: string
}

/** 動いているタイマー（`user_active_timer`）。行が無ければ null、行があって止まっていれば `timer: null` */
export async function fetchActiveTimer(supabase: SupabaseClient, userId: string): Promise<RemoteActiveTimer | null | { error: string }> {
  const { data, error } = await supabase
    .from('user_active_timer')
    .select('started_at, task_title, tags, task_id, color, updated_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) return { error: error.message }
  if (!data) return null
  const row = data as ActiveTimerRow
  const timer =
    row.started_at == null
      ? null
      : normalizeActiveTimer({
          taskTitle: row.task_title ?? '',
          startedAt: row.started_at,
          tags: row.tags,
          taskId: row.task_id,
          color: row.color,
        })
  return { timer, updatedAt: String(row.updated_at) }
}

export function pushActiveTimer(
  supabase: SupabaseClient,
  userId: string,
  value: RemoteActiveTimer,
  base: string | null,
): Promise<SettingPushResult> {
  const t = normalizeActiveTimer(value.timer)
  return pushSettingRow(
    supabase,
    'user_active_timer',
    {
      user_id: userId,
      started_at: t?.startedAt ?? null,
      task_title: t?.taskTitle ?? null,
      tags: t?.tags ?? [],
      task_id: t?.taskId ?? null,
      color: t?.color ?? null,
      updated_at: value.updatedAt,
    },
    base,
  )
}

/** 手元のタイマーの読み書き（ストア・テストの端末） */
export interface ActiveTimerIo {
  read: () => { timer: ActiveTimer | null; updatedAt: string | null }
  /** 同期で届いたタイマーにする（手元の変更として時刻を付けない） */
  apply: (timer: ActiveTimer | null, updatedAt: string) => void
  setUpdatedAt: (at: string) => void
  /** 知らずに 2 つ動いていたときの負けたほうを記録にする */
  record: (handoff: TimerHandoff) => void
}

export function activeTimerSyncDeps(
  supabase: SupabaseClient,
  userId: string,
  io: ActiveTimerIo,
): SettingSyncDeps<RemoteActiveTimer, NonNullable<ActiveTimerSyncPlan['apply']>, NonNullable<ActiveTimerSyncPlan['push']>> {
  return {
    key: 'timer',
    fetch: () => fetchActiveTimer(supabase, userId),
    plan: (remote, syncedAt, offset) => planActiveTimerSync({ ...io.read(), syncedAt }, remote, undefined, offset),
    localUpdatedAt: () => io.read().updatedAt,
    applyLocal: ({ timer, updatedAt, record }) => {
      if (record) io.record(record)
      io.apply(timer, updatedAt)
    },
    setLocalUpdatedAt: io.setUpdatedAt,
    push: (p) => pushActiveTimer(supabase, userId, p, p.base),
    onPushed: (p) => {
      if (p.record) io.record(p.record)
    },
  }
}

const syncedListeners = new Set<() => void>()

/** 動いているタイマーを 1 回合わせ終えたとき（失敗した回も）に呼ばれる。通知の「止める」が、別の端末で止めた古いタイマーを止めないように待つ */
export function onActiveTimerSynced(fn: () => void): () => void {
  syncedListeners.add(fn)
  return () => void syncedListeners.delete(fn)
}

export function notifyActiveTimerSynced(): void {
  for (const fn of [...syncedListeners]) fn()
}
