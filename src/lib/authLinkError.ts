/**
 * ログイン用リンクが使えなかったとき、Supabase は `#error=access_denied&error_code=otp_expired&…` を付けて戻す。
 * Google でのログインをやめた・失敗したときも同じ形で戻る。読み込み時に読み取って URL から消し、
 * 設定のアカウント欄で理由と次にやることを出す
 */

/** Google でのログインに出たしるし。戻ってきたエラーがメールのリンクのものか Google のものかを分ける */
const OAUTH_STARTED_KEY = 'chronograma_oauth_sign_in'

export function markOAuthSignInStarted() {
  try {
    sessionStorage.setItem(OAUTH_STARTED_KEY, '1')
  } catch {
    /* 保存できなければメールのリンクの文言になるだけ */
  }
}

/** しるしを読んで消す */
function takeOAuthSignInStarted(): boolean {
  try {
    const started = sessionStorage.getItem(OAUTH_STARTED_KEY) != null
    sessionStorage.removeItem(OAUTH_STARTED_KEY)
    return started
  } catch {
    return false
  }
}

/** URL のハッシュから認証エラーのコードを読む。認証エラーでなければ null */
export function parseAuthLinkError(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  if (!params.has('error') && !params.has('error_code')) return null
  return params.get('error_code') || params.get('error') || 'unknown'
}

let pending: string | null = null
let fromOAuth = false

if (typeof window !== 'undefined') {
  pending = parseAuthLinkError(window.location.hash)
  fromOAuth = takeOAuthSignInStarted()
  if (pending) {
    // 再読み込みで同じ表示を繰り返さないよう、ハッシュだけ消す
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
  }
}

/** まだ見せていない認証エラーのコード */
export function pendingAuthLinkError(): string | null {
  return pending
}

/** 見せ終わった */
export function clearAuthLinkError() {
  pending = null
}

/** 表示する文言の翻訳キー。`viaOAuth` は Google でのログインから戻ってきたとき */
export function authLinkErrorKey(code: string, viaOAuth = fromOAuth): string {
  if (viaOAuth) return 'account.googleFailed'
  return code === 'otp_expired' ? 'account.linkExpired' : 'account.linkFailed'
}
