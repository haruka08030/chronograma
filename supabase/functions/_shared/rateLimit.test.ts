import { describe, expect, it, vi } from 'vitest'
import { RATE_LIMITS, withinRateLimit } from './rateLimit.ts'

const client = (result: { data: unknown; error: { message: string } | null } | Error) => ({
  rpc: () => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)),
})

describe('withinRateLimit', () => {
  it('上限以内なら通し、超えたら止める', async () => {
    expect(await withinRateLimit(client({ data: true, error: null }), 'u', RATE_LIMITS.notion)).toBe(true)
    expect(await withinRateLimit(client({ data: false, error: null }), 'u', RATE_LIMITS.notion)).toBe(false)
  })

  it('数えられないときは止める（素通しにしない）', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await withinRateLimit(client({ data: null, error: { message: 'function does not exist' } }), 'u', RATE_LIMITS.notion)).toBe(
      false,
    )
    expect(await withinRateLimit(client(new Error('network')), 'u', RATE_LIMITS.notion)).toBe(false)
    expect(await withinRateLimit(client({ data: null, error: null }), 'u', RATE_LIMITS.notion)).toBe(false)
    spy.mockRestore()
  })
})
