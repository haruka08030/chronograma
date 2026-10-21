import type { SupabaseClient } from '@supabase/supabase-js'
import type { SettingPushResult } from './settingSync'
import { pushSettingRow } from './supabaseData'
import { normalizeSleepTimer, type RemoteSleepTimer } from './sleepTimer'

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
