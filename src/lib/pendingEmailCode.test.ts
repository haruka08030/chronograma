// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { clearPendingEmailCode, pendingEmailCode, savePendingEmailCode } from './pendingEmailCode'

afterEach(() => clearPendingEmailCode())

describe('pendingEmailCode', () => {
  it('returns the address a code was sent to', () => {
    savePendingEmailCode('a@example.com', 1_000)
    expect(pendingEmailCode(1_000 + 10 * 60 * 1000)).toBe('a@example.com')
  })

  it('forgets the address once the code has expired', () => {
    savePendingEmailCode('a@example.com', 1_000)
    expect(pendingEmailCode(1_000 + 61 * 60 * 1000)).toBeNull()
    expect(pendingEmailCode(1_000)).toBeNull()
  })

  it('returns null when nothing was sent or it was cleared', () => {
    expect(pendingEmailCode()).toBeNull()
    savePendingEmailCode('a@example.com')
    clearPendingEmailCode()
    expect(pendingEmailCode()).toBeNull()
  })
})
