/**
 * ログイン用リンクが使えなかったとき、Supabase は `#error=access_denied&error_code=otp_expired&…` を付けて戻す。
 * 以前は何も出ず、ログインできないまま止まって見えた。読み込み時に読み取って URL から消し、
 * 設定のアカウント欄で理由と次にやることを出す
 */

/** URL のハッシュから認証エラーのコードを読む。認証エラーでなければ null */
export function parseAuthLinkError(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  if (!params.has('error') && !params.has('error_code')) return null
  return params.get('error_code') || params.get('error') || 'unknown'
}

let pending: string | null = null

if (typeof window !== 'undefined') {
  pending = parseAuthLinkError(window.location.hash)
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

/** 表示する文言の翻訳キー */
export function authLinkErrorKey(code: string): string {
  return code === 'otp_expired' ? 'account.linkExpired' : 'account.linkFailed'
}
