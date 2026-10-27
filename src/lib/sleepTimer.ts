import { timerRecordTimes } from './timerRecord'

/**
 * 睡眠のタイマー（#519）。寝る前に「寝る」を押し、起きたら「起きた」で 1 晩の睡眠にする。
 * 記録のタイマー（`activeTimer`）とは別に持ち、止め忘れの通知も出さない（寝ている間に鳴らさない）。
 * 端末間で同じになる（`user_sleep_timer`、`043`）。スマホで寝て、PC で起きたと押せる
 */
export type SleepTimer = { startedAt: string }

/** これより長く寝ているタイマーは、今を起きた時刻にせず、起きた時刻を聞く */
export const SLEEP_TIMER_MAX_MS = 16 * 60 * 60_000

export function normalizeSleepTimer(raw: unknown): SleepTimer | null {
  const x = raw as Partial<SleepTimer> | null | undefined
  if (!x || typeof x.startedAt !== 'string') return null
  const ms = Date.parse(x.startedAt)
  return Number.isFinite(ms) ? { startedAt: new Date(ms).toISOString() } : null
}

export type SleepFromTimer = { wakeDateKey: string; bedTime: string; wakeTime: string }

/**
 * 寝た時刻から今までを 1 晩の睡眠（起きた日・寝た時刻・起きた時刻、アプリのタイムゾーン）にする。
 * 1 分未満（押し間違い）と、長すぎて今を起きた時刻にできないとき（`SLEEP_TIMER_MAX_MS`）は null
 */
export function sleepFromTimer(timer: SleepTimer, wokeAt: string): SleepFromTimer | null {
  if (Date.parse(wokeAt) - Date.parse(timer.startedAt) > SLEEP_TIMER_MAX_MS) return null
  const times = timerRecordTimes(timer.startedAt, wokeAt)
  if (!times || times.startTime === times.endTime) return null
  return { wakeDateKey: times.endDate ?? times.dueDate, bedTime: times.startTime, wakeTime: times.endTime }
}

/**
 * 睡眠のタイマーの同期。サーバーには利用者ごとに 1 行（`user_sleep_timer`）。止めたら行は消さずに started_at を null にする
 * （記録のタイマーの `user_active_timer` と同じ）。手元とサーバーの新しいほうに合わせる。両方で起きたと押しても、
 * 重なる睡眠は `logSleep` が直すので 2 つにならない
 */
export type LocalSleepTimer = { timer: SleepTimer | null; updatedAt: string | null; syncedAt?: string | null }
export type RemoteSleepTimer = { timer: SleepTimer | null; updatedAt: string }
export type SleepTimerSyncPlan = {
  apply?: RemoteSleepTimer
  push?: RemoteSleepTimer & { base: string | null }
  adopt?: string
}
