import type { SupabaseClient } from '@supabase/supabase-js'
import { settingSyncStep, type SettingPushResult } from './settingSync'
import { pushSettingRow } from './supabaseData'
import { timerRecordTimes } from './timerRecord'

/**
 * 睡眠のタイマー（#519）。寝る前に「寝る」を押し、起きたら「起きた」で 1 晩の睡眠にする。
 * 記録のタイマー（`activeTimer`）とは別に持ち、止め忘れの通知も出さない（寝ている間に鳴らさない）。
 * 端末間で同じになる（`user_sleep_timer`、`043`）。スマホで寝て、PC で起きたと押せる
 */
export type SleepTimer = { startedAt: string }

/** これより長く寝ているタイマーは、今を起きた時刻にせず、起きた時刻を聞く */
export const SLEEP_TIMER_MAX_MS = 16 * 60 * 60_000

/** 「寝る」を出す時間帯（夜 20 時〜朝 5 時）。昼に押して朝の睡眠を書き換えない */
export const GO_TO_BED_FROM_MIN = 20 * 60
export const GO_TO_BED_UNTIL_MIN = 5 * 60

export function isBedtime(nowMin: number): boolean {
  return nowMin >= GO_TO_BED_FROM_MIN || nowMin < GO_TO_BED_UNTIL_MIN
}

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
 * 睡眠は起きた日ごとに 1 つ（`logSleep` が同じ日の睡眠を直す）なので 2 つにならない
 */
export type LocalSleepTimer = { timer: SleepTimer | null; updatedAt: string | null; syncedAt?: string | null }
export type RemoteSleepTimer = { timer: SleepTimer | null; updatedAt: string }
export type SleepTimerSyncPlan = {
  apply?: RemoteSleepTimer
  push?: RemoteSleepTimer & { base: string | null }
  adopt?: string
}

export function planSleepTimerSync(
  local: LocalSleepTimer,
  remote: RemoteSleepTimer | null,
  nowIso: string = new Date().toISOString(),
  clockOffsetMs = 0,
): SleepTimerSyncPlan {
  const mine = normalizeSleepTimer(local.timer)
  if (!remote) {
    // 一度も押していなければ送らない
    if (local.updatedAt === null) return {}
    return { push: { timer: mine, updatedAt: local.updatedAt, base: null } }
  }
  const theirs = normalizeSleepTimer(remote.timer)
  const step = settingSyncStep(
    { updatedAt: local.updatedAt, syncedAt: local.syncedAt ?? null },
    remote,
    (mine?.startedAt ?? null) === (theirs?.startedAt ?? null),
    clockOffsetMs,
  )
  switch (step.kind) {
    case 'initial':
    case 'apply':
      return { apply: { timer: theirs, updatedAt: remote.updatedAt } }
    case 'push':
      return { push: { timer: mine, updatedAt: local.updatedAt ?? nowIso, base: step.base } }
    case 'adopt':
      return { adopt: remote.updatedAt }
    default:
      return {}
  }
}

/** 睡眠のタイマー（`user_sleep_timer`）。行が無ければ null、行があって寝ていなければ `timer: null` */
export async function fetchSleepTimer(supabase: SupabaseClient, userId: string): Promise<RemoteSleepTimer | null | { error: string }> {
  const { data, error } = await supabase.from('user_sleep_timer').select('started_at, updated_at').eq('user_id', userId).maybeSingle()
  if (error) return { error: error.message }
  if (!data) return null
  const row = data as { started_at: string | null; updated_at: string }
  return { timer: row.started_at == null ? null : normalizeSleepTimer({ startedAt: row.started_at }), updatedAt: String(row.updated_at) }
}

export function pushSleepTimer(
  supabase: SupabaseClient,
  userId: string,
  value: RemoteSleepTimer,
  base: string | null,
): Promise<SettingPushResult> {
  const t = normalizeSleepTimer(value.timer)
  return pushSettingRow(
    supabase,
    'user_sleep_timer',
    { user_id: userId, started_at: t?.startedAt ?? null, updated_at: value.updatedAt },
    base,
  )
}
