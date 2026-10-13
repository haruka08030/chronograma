/**
 * 設定の「お問い合わせ・フィードバック」を Supabase の表 `feedback`（`036_feedback.sql`）に送る。外部のサービスは使わない。
 * - 送れるのはログインしている人だけ（表は本人の insert だけ。送ったものは端末から読めない）
 * - 文面のほか、不具合を確かめるためにアプリの版とブラウザを付ける（`errorReport.ts` と同じ上限で切る）
 * - 1 人 24 時間に 20 件まで（DB が `feedback_rate_limited` で断る）
 */
import { getSupabase } from './supabase'
import { isNetworkErrorMessage } from './errorMessages'
import { LIMITS, truncate } from './errorReport'

/** `feedback_size_check` と同じ上限（文字数） */
export const MAX_FEEDBACK_LENGTH = 2000

export type FeedbackResult = { ok: true } | { ok: false; reason: 'network' | 'rateLimited' | 'failed' }

/** 送る行（DB の列名） */
export function buildFeedbackRow(message: string) {
  const version = (import.meta.env.VITE_APP_VERSION as string | undefined) || null
  return {
    message: message.trim().slice(0, MAX_FEEDBACK_LENGTH),
    app_version: version ? truncate(version, LIMITS.appVersion) : null,
    user_agent: typeof navigator !== 'undefined' && navigator.userAgent ? truncate(navigator.userAgent, LIMITS.userAgent) : null,
  }
}

/** 送る。空の文面・Supabase が無いときは送らずに failed */
export async function sendFeedback(message: string): Promise<FeedbackResult> {
  const row = buildFeedbackRow(message)
  const sb = getSupabase()
  if (!sb || !row.message) return { ok: false, reason: 'failed' }
  try {
    const { error } = await sb.from('feedback').insert(row)
    if (!error) return { ok: true }
    if (error.message.includes('feedback_rate_limited')) return { ok: false, reason: 'rateLimited' }
    return { ok: false, reason: isNetworkErrorMessage(error.message) ? 'network' : 'failed' }
  } catch (err) {
    return { ok: false, reason: isNetworkErrorMessage(err instanceof Error ? err.message : '') ? 'network' : 'failed' }
  }
}
