import type { SupabaseClient } from '@supabase/supabase-js'
import { format } from 'date-fns'
import { reportSyncError } from './errorReport'
import { SYNC_PROTOCOL_VERSION } from './syncVersion'

/**
 * どの版のアプリがまだ同期しているかをサーバーに残す（`023` の `note_app_version`、#360）。
 * 版の下限（`app_config.min_sync_version`）をいつ上げてよいかを、版ごとの人数で決めるため。
 * 送るのは 1 日 1 回まで（この端末・この人・この版で、今日もう送れていれば送らない）。
 * 送れなければ同期の失敗として残すだけで、同期は止めない。このページを開いている間は、送れても送れなくても同じ日にもう一度は送らない
 * （送れなかった日は次に開いたときにまた送る）
 */

/** 最後に送れた日（localStorage。値は `版|取り決めの版|yyyy-MM-dd`） */
export const VERSION_SEEN_KEY = (userId: string) => `chronograma-version-seen-v1:${userId}`

/** DB の上限（`app_versions_seen_shape_check`）と同じ */
const MAX_APP_VERSION = 100

/** 送るアプリの版（ビルド時の版。無ければ `dev`） */
export function appVersionForSync(): string {
  const v = (import.meta.env.VITE_APP_VERSION as string | undefined) || 'dev'
  return v.slice(0, MAX_APP_VERSION)
}

/** このページで送った（送ろうとした）印。同期のたびに呼んでも、失敗し続けても、保存できなくても 1 日 1 回にする */
const triedThisPage = new Set<string>()

export function resetVersionSeenForTests(): void {
  triedThisPage.clear()
}

/** 今日もう送っていなければ送る。何があっても投げない */
export async function noteAppVersion(supabase: SupabaseClient, userId: string, now = new Date()): Promise<void> {
  try {
    const stamp = `${appVersionForSync()}|${SYNC_PROTOCOL_VERSION}|${format(now, 'yyyy-MM-dd')}`
    const key = VERSION_SEEN_KEY(userId)
    if (triedThisPage.has(`${key}|${stamp}`)) return
    let sent: string | null = null
    try {
      sent = localStorage.getItem(key)
    } catch {
      // 読めなければ送る（1 日に何度か送っても同じ行が進むだけ）
    }
    if (sent === stamp) return
    triedThisPage.add(`${key}|${stamp}`)
    const { error } = await supabase.rpc('note_app_version', {
      p_app_version: appVersionForSync(),
      p_sync_protocol_version: SYNC_PROTOCOL_VERSION,
    })
    if (error) {
      reportSyncError('version-seen', `note_app_version: ${error.message}`)
      return
    }
    try {
      localStorage.setItem(key, stamp)
    } catch {
      // 保存できなければ次に開いたときにもう一度送る（同じ行が進むだけ）
    }
  } catch (err) {
    reportSyncError('version-seen', err)
  }
}
