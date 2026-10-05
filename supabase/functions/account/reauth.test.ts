import { describe, expect, it } from 'vitest'
import { decodeJwtPayload, isRecentSignIn, REAUTH_MAX_AGE_MS, signedInAt } from './reauth.ts'

function jwt(payload: unknown): string {
  const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `Bearer ${b64url('{"alg":"HS256"}')}.${b64url(JSON.stringify(payload))}.sig`
}

describe('decodeJwtPayload', () => {
  it('Bearer の JWT の中身を読む', () => {
    expect(decodeJwtPayload(jwt({ sub: 'u', amr: [{ method: 'otp', timestamp: 1 }] }))).toEqual({
      sub: 'u',
      amr: [{ method: 'otp', timestamp: 1 }],
    })
  })

  it('読めない値は null', () => {
    expect(decodeJwtPayload('Bearer nope')).toBeNull()
    expect(decodeJwtPayload('Bearer a.!!!.c')).toBeNull()
  })
})

describe('signedInAt', () => {
  it('amr のいちばん新しい時刻（秒）を使う', () => {
    const payload = {
      amr: [
        { method: 'oauth', timestamp: 1000 },
        { method: 'otp', timestamp: 2000 },
      ],
    }
    expect(signedInAt(payload, '2020-01-01T00:00:00Z')).toBe(2_000_000)
  })

  it('amr が無いときだけ last_sign_in_at', () => {
    expect(signedInAt({}, '2026-01-01T00:00:00Z')).toBe(Date.parse('2026-01-01T00:00:00Z'))
    expect(signedInAt({ amr: [] }, null)).toBeNull()
    expect(signedInAt(null, undefined)).toBeNull()
  })
})

describe('isRecentSignIn', () => {
  const now = Date.parse('2026-10-04T12:00:00Z')
  it('10 分以内なら最近', () => {
    expect(isRecentSignIn(now - 60_000, now)).toBe(true)
    expect(isRecentSignIn(now - REAUTH_MAX_AGE_MS, now)).toBe(true)
  })

  it('古い・分からない・遠い未来は最近ではない', () => {
    expect(isRecentSignIn(now - REAUTH_MAX_AGE_MS - 1, now)).toBe(false)
    expect(isRecentSignIn(null, now)).toBe(false)
    expect(isRecentSignIn(now + 5 * 60_000, now)).toBe(false)
  })
})
