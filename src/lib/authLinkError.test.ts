import { describe, expect, it } from 'vitest'
import { authLinkErrorKey, parseAuthLinkError } from './authLinkError'

describe('parseAuthLinkError', () => {
  it('reads the error code Supabase puts in the hash', () => {
    expect(
      parseAuthLinkError('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb='),
    ).toBe('otp_expired')
  })

  it('falls back to the error when there is no code', () => {
    expect(parseAuthLinkError('#error=server_error')).toBe('server_error')
  })

  it('ignores a successful sign-in and empty hashes', () => {
    expect(parseAuthLinkError('#access_token=abc&refresh_token=def&type=magiclink')).toBeNull()
    expect(parseAuthLinkError('')).toBeNull()
  })
})

describe('authLinkErrorKey', () => {
  it('explains an expired or used link separately', () => {
    expect(authLinkErrorKey('otp_expired', false)).toBe('account.linkExpired')
    expect(authLinkErrorKey('access_denied', false)).toBe('account.linkFailed')
  })

  it('explains a cancelled or failed Google sign-in as such', () => {
    expect(authLinkErrorKey('access_denied', true)).toBe('account.googleFailed')
  })
})
