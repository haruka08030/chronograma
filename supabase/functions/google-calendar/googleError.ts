/**
 * Google（トークンの更新・Calendar API）が断ったときの理由の読み分け。
 * Google は利用上限でも 403 を返すので、ステータスだけで「つなぎ直し」にしない。
 * 本文の `error.errors[].reason`（Calendar API）や `error`（トークン）を見て分ける
 */

/** 利用上限の理由（Calendar API の `errors[].reason`）。待てば直るので連携は外さない */
const RATE_LIMIT_REASONS = new Set(['rateLimitExceeded', 'userRateLimitExceeded', 'quotaExceeded', 'dailyLimitExceeded'])
/** 許可（スコープ）が足りない理由。`details[].reason` の ACCESS_TOKEN_SCOPE_INSUFFICIENT も含める */
const SCOPE_REASONS = new Set(['insufficientPermissions', 'ACCESS_TOKEN_SCOPE_INSUFFICIENT'])
/** こちらの設定の誤り（API が有効でないなど）。全員の連携を外さない */
const SERVER_REASONS = new Set(['accessNotConfigured', 'SERVICE_DISABLED'])

export class GoogleApiError extends Error {
  /** どこで断られたか */
  readonly source: 'token' | 'calendar'
  readonly status: number
  /** 本文から読めた理由（`rateLimitExceeded` / `invalid_grant` など）。読めなければ空 */
  readonly reasons: string[]

  constructor(source: 'token' | 'calendar', status: number, reasons: string[], body: string) {
    super(source === 'token' ? `Google token refresh failed: ${status} ${body}` : `Calendar API error ${status}: ${body}`)
    this.name = 'GoogleApiError'
    this.source = source
    this.status = status
    this.reasons = reasons
  }
}

/** Google のエラー本文から理由を取り出す（JSON でなければ空） */
export function parseGoogleErrorReasons(body: string): string[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return []
  }
  if (!parsed || typeof parsed !== 'object') return []
  const err = (parsed as { error?: unknown }).error
  // トークンの更新: { "error": "invalid_grant", "error_description": "..." }
  if (typeof err === 'string') return [err]
  if (!err || typeof err !== 'object') return []
  const out: string[] = []
  const { errors, details, status } = err as { errors?: unknown; details?: unknown; status?: unknown }
  for (const list of [errors, details]) {
    if (!Array.isArray(list)) continue
    for (const item of list) {
      const reason = (item as { reason?: unknown } | null)?.reason
      if (typeof reason === 'string' && reason) out.push(reason)
    }
  }
  if (typeof status === 'string' && status) out.push(status)
  return out
}

/**
 * - `rate_limited`: 利用上限・送りすぎ。少し待てば直る（連携は残す）
 * - `auth_expired`: リフレッシュトークンが取り消された・期限切れ。つなぎ直しが必要
 * - `scope`: 許可（スコープ）が足りない。書き込みを許可してつなぎ直す
 * - `forbidden`: その予定を変える権限が無い（他人の予定など）
 * - `failed`: Google の一時的な失敗・こちらの設定の誤り（連携は残す）
 */
export type GoogleErrorKind = 'rate_limited' | 'auth_expired' | 'scope' | 'forbidden' | 'failed'

export function classifyGoogleError(e: unknown): GoogleErrorKind {
  if (!(e instanceof GoogleApiError)) return 'failed'
  const { source, status, reasons } = e
  if (status === 429 || reasons.some((r) => RATE_LIMIT_REASONS.has(r))) return 'rate_limited'
  if (source === 'token') {
    // invalid_grant だけが「取り消された・期限切れ」。invalid_client などはサーバーの設定の誤り
    return reasons.includes('invalid_grant') ? 'auth_expired' : 'failed'
  }
  if (status === 401) return 'auth_expired'
  if (status === 403) {
    if (reasons.some((r) => SCOPE_REASONS.has(r))) return 'scope'
    if (reasons.some((r) => SERVER_REASONS.has(r))) return 'failed'
    // 理由が読めないときは本文の文言で（"insufficient authentication scopes"）
    if (reasons.length === 0 && /insufficient|scope/i.test(e.message)) return 'scope'
    return 'forbidden'
  }
  return 'failed'
}

/** 少し待ってからもう一度試す価値があるか（読み取りだけで使う） */
export function isRetryableGoogleError(e: unknown): boolean {
  return classifyGoogleError(e) === 'rate_limited'
}
