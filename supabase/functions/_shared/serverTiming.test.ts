import { describe, expect, it } from 'vitest'
import { createServerTiming, withServerTiming } from './serverTiming'

describe('createServerTiming', () => {
  it('records each step and the total, marking only the first request as cold', async () => {
    let t = 0
    const now = () => t
    const first = createServerTiming(now)
    await first.time('auth', async () => {
      t += 40
    })
    await expect(
      first.time('google', async () => {
        t += 100.25
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(first.header()).toBe('auth;dur=40.0, google;dur=100.3, cold, total;dur=140.3')

    const second = createServerTiming(now)
    expect(second.header()).toBe('total;dur=0.0')
  })
})

describe('withServerTiming', () => {
  it('adds the header and keeps the status, body and other headers', async () => {
    const handler = withServerTiming(async (_req, timing) => {
      await timing.time('db', async () => {})
      return new Response('{"ok":true}', { status: 409, headers: { 'Content-Type': 'application/json' } })
    })
    const res = await handler(new Request('https://x.test', { method: 'POST' }))
    expect(res.status).toBe(409)
    expect(res.headers.get('Content-Type')).toBe('application/json')
    expect(res.headers.get('Server-Timing')).toMatch(/^db;dur=\d+\.\d, (cold, )?total;dur=\d+\.\d$/)
    expect(await res.text()).toBe('{"ok":true}')
  })
})
