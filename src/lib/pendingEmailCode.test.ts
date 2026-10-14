// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  clearPendingEmailCode,
  dismissPendingEmailCode,
  pendingEmailCode,
  savePendingEmailCode,
  shouldReturnToEmailCode,
} from './pendingEmailCode'

afterEach(() => {
  clearPendingEmailCode('signIn')
  clearPendingEmailCode('reauth')
})

describe('pendingEmailCode', () => {
  it('returns the address a code was sent to', () => {
    savePendingEmailCode('signIn', 'a@example.com', 1_000)
    expect(pendingEmailCode('signIn', 1_000 + 10 * 60 * 1000)).toEqual({ email: 'a@example.com', sentAt: 1_000, dismissed: false })
  })

  it('forgets the address once the code has expired', () => {
    savePendingEmailCode('signIn', 'a@example.com', 1_000)
    expect(pendingEmailCode('signIn', 1_000 + 61 * 60 * 1000)).toBeNull()
    expect(pendingEmailCode('signIn', 1_000)).toBeNull()
  })

  it('returns null when nothing was sent or it was cleared', () => {
    expect(pendingEmailCode('signIn')).toBeNull()
    savePendingEmailCode('signIn', 'a@example.com')
    clearPendingEmailCode('signIn')
    expect(pendingEmailCode('signIn')).toBeNull()
  })

  it('keeps sign-in and re-authentication apart', () => {
    savePendingEmailCode('reauth', 'a@example.com')
    expect(pendingEmailCode('signIn')).toBeNull()
    expect(pendingEmailCode('reauth')?.email).toBe('a@example.com')
  })
})

describe('shouldReturnToEmailCode', () => {
  it('returns to the code until the field is closed, but keeps the address', () => {
    savePendingEmailCode('signIn', 'a@example.com')
    expect(shouldReturnToEmailCode('signIn')).toBe(true)
    dismissPendingEmailCode('signIn')
    expect(shouldReturnToEmailCode('signIn')).toBe(false)
    expect(pendingEmailCode('signIn')?.email).toBe('a@example.com')
  })
})
