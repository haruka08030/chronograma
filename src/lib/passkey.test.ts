import { describe, expect, it } from 'vitest'
import { classifyPasskeyError, defaultPasskeyName, passkeyErrorKey } from './passkey'

function domError(name: string) {
  const e = new Error(name)
  e.name = name
  return e
}

describe('classifyPasskeyError', () => {
  it('Face ID の画面を閉じた（NotAllowedError）・取り消しは cancelled で、文言を出さない', () => {
    const closed = { code: 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY', message: 'denied', cause: domError('NotAllowedError') }
    expect(classifyPasskeyError(closed)).toBe('cancelled')
    expect(classifyPasskeyError({ code: 'ERROR_CEREMONY_ABORTED' })).toBe('cancelled')
    expect(passkeyErrorKey('cancelled')).toBeNull()
  })

  it('登録済みの端末は alreadyRegistered', () => {
    expect(classifyPasskeyError({ code: 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED' })).toBe('alreadyRegistered')
  })

  it('ドメインが合わない・無効は unavailable', () => {
    expect(classifyPasskeyError({ code: 'ERROR_INVALID_RP_ID' })).toBe('unavailable')
    expect(classifyPasskeyError({ code: 'passkey_disabled', message: '' })).toBe('unavailable')
    expect(classifyPasskeyError({ message: 'WebAuthn is not enabled' })).toBe('unavailable')
  })

  it('期限切れ・見つからない・そのほか', () => {
    expect(classifyPasskeyError({ code: 'webauthn_challenge_expired' })).toBe('expired')
    expect(classifyPasskeyError({ message: 'Passkey not found' })).toBe('notFound')
    expect(classifyPasskeyError({ message: 'boom' })).toBe('other')
    expect(passkeyErrorKey('other')).toBe('account.passkeyFailed')
  })
})

describe('defaultPasskeyName', () => {
  it('端末の種類から名前を付ける', () => {
    expect(defaultPasskeyName('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('iPhone')
    expect(defaultPasskeyName('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('Mac')
    expect(defaultPasskeyName('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('Windows')
    expect(defaultPasskeyName('')).toBe('Passkey')
  })
})
