/**
 * メールでコードを送った宛先。ホーム画面に追加したアプリはメールを見に行くと閉じられることがあるので、
 * 開き直してもコードを打つ欄に戻れるよう端末に残す（sessionStorage はアプリを閉じると消える）
 */

const KEY = 'chronograma_email_code_sent'
/** Supabase のコードの有効期限。過ぎたら打っても通らないので戻さない */
const VALID_MS = 60 * 60 * 1000

export function savePendingEmailCode(email: string, now = Date.now()) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ email, sentAt: now }))
  } catch {
    /* 残せなければ開き直したときにメールアドレスからやり直すだけ */
  }
}

/** まだ使えるコードを送った宛先。無い・期限切れなら null */
export function pendingEmailCode(now = Date.now()): string | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { email?: unknown; sentAt?: unknown } | null
    if (typeof raw?.email !== 'string' || typeof raw.sentAt !== 'number') return null
    if (now - raw.sentAt > VALID_MS || now < raw.sentAt) {
      clearPendingEmailCode()
      return null
    }
    return raw.email
  } catch {
    return null
  }
}

export function clearPendingEmailCode() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* 消せなくても期限で戻さなくなる */
  }
}
