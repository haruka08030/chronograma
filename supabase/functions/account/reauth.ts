/**
 * アカウントの削除の前の本人確認。セッションを最近ログインして作ったときだけ消せるようにする
 * （開いたままの端末や盗まれたトークンで、すぐには消せないように）。
 *
 * - ログインした時刻は JWT の `amr`（このセッションを作ったログインの方法と時刻。トークンを更新しても変わらない）から取る
 * - `amr` が無いトークンだけ、利用者の `last_sign_in_at`（どの端末でも最後にログインした時刻）で代える
 * - 古ければ `reauth_required` を返し、クライアントはメールのコードでログインし直してから送り直す
 */

/** この時間より前にログインしたセッションでは消せない */
export const REAUTH_MAX_AGE_MS = 10 * 60_000

type AmrEntry = { method?: unknown; timestamp?: unknown }

/** `Bearer <jwt>` の中身（署名の確認は auth.getUser が済ませている前提）。読めなければ null */
export function decodeJwtPayload(authHeader: string): Record<string, unknown> | null {
  const token = authHeader.replace(/^Bearer\s+/i, '')
  const part = token.split('.')[1]
  if (!part) return null
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const payload = JSON.parse(new TextDecoder().decode(bytes))
    return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** このセッションでログインした時刻（ミリ秒）。分からなければ null */
export function signedInAt(payload: Record<string, unknown> | null, lastSignInAt: string | null | undefined): number | null {
  const amr = payload?.amr
  if (Array.isArray(amr)) {
    const times = (amr as AmrEntry[])
      .map((e) => (typeof e?.timestamp === 'number' && Number.isFinite(e.timestamp) ? e.timestamp * 1000 : null))
      .filter((t): t is number => t !== null)
    if (times.length > 0) return Math.max(...times)
  }
  const last = lastSignInAt ? Date.parse(lastSignInAt) : NaN
  return Number.isFinite(last) ? last : null
}

/** 最近ログインしたか。未来の時刻（時計のずれ）は 1 分まで許す */
export function isRecentSignIn(at: number | null, now = Date.now(), maxAgeMs = REAUTH_MAX_AGE_MS): boolean {
  if (at === null) return false
  return now - at <= maxAgeMs && at - now <= 60_000
}
