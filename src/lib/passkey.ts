/*
 * パスキー（Face ID・Touch ID・端末のロック解除でログイン）。Supabase Auth の WebAuthn を使う。
 * ホーム画面に追加した PWA でも、メールのリンクや Google の画面のように Safari へ移らず、その場で終わる。
 * パスキーはログイン済みのアカウントに後から登録する（初めてはメールのコードか Google で入る）
 */

/** この端末・ブラウザがパスキーを使えるか（HTTPS か localhost で、WebAuthn がある） */
export function isPasskeySupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    typeof window.PublicKeyCredential === 'function' &&
    typeof navigator.credentials?.get === 'function'
  )
}

type PasskeyErrorLike = { name?: string; code?: string; message?: string; cause?: unknown } | null | undefined

export type PasskeyFailure =
  /** 利用者が Face ID の画面を閉じた・選ばなかった。何も出さない */
  | 'cancelled'
  /** この端末に、このアプリのパスキーが無い（登録した端末と別・消した） */
  | 'notFound'
  /** この端末にはもう登録してある */
  | 'alreadyRegistered'
  /** プロジェクトでパスキーが有効になっていない・ドメインが合わない */
  | 'unavailable'
  | 'expired'
  | 'other'

function causeName(error: PasskeyErrorLike): string | undefined {
  const cause = error?.cause as { name?: string } | undefined
  return cause?.name ?? error?.name
}

/** パスキーの失敗を、出し分けられる種類に分ける */
export function classifyPasskeyError(error: PasskeyErrorLike): PasskeyFailure {
  if (!error) return 'other'
  const code = error.code ?? ''
  const message = error.message ?? ''
  if (code === 'ERROR_CEREMONY_ABORTED' || causeName(error) === 'AbortError') return 'cancelled'
  if (code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED' || causeName(error) === 'InvalidStateError') return 'alreadyRegistered'
  if (code === 'webauthn_challenge_expired') return 'expired'
  if (code === 'ERROR_INVALID_DOMAIN' || code === 'ERROR_INVALID_RP_ID' || (/passkey|webauthn/i.test(code) && /disabled|not_enabled/i.test(code)))
    return 'unavailable'
  if (/credential.*not found|passkey.*not found|unknown credential/i.test(message) || code === 'webauthn_credential_not_found') return 'notFound'
  // Safari・Chrome は閉じたときも、時間切れのときも NotAllowedError を返す（区別できない）
  if (causeName(error) === 'NotAllowedError') return 'cancelled'
  if (/not ?enabled|disabled/i.test(message) && /passkey|webauthn/i.test(message)) return 'unavailable'
  return 'other'
}

/** 失敗の種類ごとの文言のキー。閉じただけ（cancelled）は出さない */
export function passkeyErrorKey(failure: PasskeyFailure): string | null {
  switch (failure) {
    case 'cancelled':
      return null
    case 'notFound':
      return 'account.passkeyNotFound'
    case 'alreadyRegistered':
      return 'account.passkeyAlreadyRegistered'
    case 'unavailable':
      return 'account.passkeyUnavailable'
    case 'expired':
      return 'account.passkeyExpired'
    default:
      return 'account.passkeyFailed'
  }
}

/** 登録したときの名前（一覧で端末を見分けるため）。User-Agent からおおまかに付ける */
export function defaultPasskeyName(ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): string {
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return 'Android'
  if (/Macintosh|Mac OS X/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows'
  if (/Linux/.test(ua)) return 'Linux'
  return 'Passkey'
}
