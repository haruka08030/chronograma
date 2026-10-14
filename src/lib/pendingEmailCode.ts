/**
 * メールでコードを送った宛先。ホーム画面に追加したアプリはメールを見に行くと閉じられたり、
 * 新しい版に読み込み直されたりするので、開き直してもコードを打つ欄に戻れるよう端末に残す
 * （sessionStorage はアプリを閉じると消える）。ログインと、削除の前の本人確認で別に持つ
 */

export type EmailCodePurpose = 'signIn' | 'reauth'

const KEYS: Record<EmailCodePurpose, string> = {
  signIn: 'chronograma_email_code_sent',
  reauth: 'chronograma_reauth_code_sent',
}
/** Supabase のコードの有効期限。過ぎたら打っても通らないので戻さない */
const VALID_MS = 60 * 60 * 1000
/** Supabase が同じ宛先へ続けて送るのを待たせる間 */
export const RESEND_WAIT_MS = 60 * 1000

export type PendingEmailCode = {
  email: string
  sentAt: number
  /** 欄を自分で閉じた・画面を離れた。開き直しても欄へ連れ戻さない */
  dismissed: boolean
}

function write(purpose: EmailCodePurpose, value: PendingEmailCode) {
  try {
    localStorage.setItem(KEYS[purpose], JSON.stringify(value))
  } catch {
    /* 残せなければ開き直したときに最初からやり直すだけ */
  }
}

export function savePendingEmailCode(purpose: EmailCodePurpose, email: string, now = Date.now()) {
  write(purpose, { email, sentAt: now, dismissed: false })
}

/** まだ使えるコードを送った宛先。無い・期限切れなら null */
export function pendingEmailCode(purpose: EmailCodePurpose, now = Date.now()): PendingEmailCode | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEYS[purpose]) ?? 'null') as Partial<Record<keyof PendingEmailCode, unknown>> | null
    if (typeof raw?.email !== 'string' || typeof raw.sentAt !== 'number') return null
    if (now - raw.sentAt > VALID_MS || now < raw.sentAt) {
      clearPendingEmailCode(purpose)
      return null
    }
    return { email: raw.email, sentAt: raw.sentAt, dismissed: raw.dismissed === true }
  } catch {
    return null
  }
}

/** 開いたときにコードの欄へ連れ戻すか（送ったまま閉じられた） */
export function shouldReturnToEmailCode(purpose: EmailCodePurpose, now = Date.now()): boolean {
  const pending = pendingEmailCode(purpose, now)
  return pending != null && !pending.dismissed
}

/** 欄を自分で閉じた。コードはまだ打てるが、開き直しても連れ戻さない */
export function dismissPendingEmailCode(purpose: EmailCodePurpose) {
  const pending = pendingEmailCode(purpose)
  if (pending && !pending.dismissed) write(purpose, { ...pending, dismissed: true })
}

export function clearPendingEmailCode(purpose: EmailCodePurpose) {
  try {
    localStorage.removeItem(KEYS[purpose])
  } catch {
    /* 消せなくても期限で戻さなくなる */
  }
}
