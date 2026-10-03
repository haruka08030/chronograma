import { describe, expect, it } from 'vitest'
import { otpRateLimit } from './errorMessages'

describe('otpRateLimit', () => {
  it('reads the wait from the per-address cooldown', () => {
    expect(otpRateLimit({ message: 'For security purposes, you can only request this after 42 seconds.', status: 429 })).toEqual({ seconds: 42 })
  })

  it('recognizes the project-wide email limit', () => {
    expect(otpRateLimit({ message: 'email rate limit exceeded', status: 429, code: 'over_email_send_rate_limit' })).toEqual({ seconds: null })
    expect(otpRateLimit({ message: 'email rate limit exceeded' })).toEqual({ seconds: null })
  })

  it('leaves other errors alone', () => {
    expect(otpRateLimit({ message: 'Invalid email', status: 400 })).toBeNull()
    expect(otpRateLimit(null)).toBeNull()
  })
})
