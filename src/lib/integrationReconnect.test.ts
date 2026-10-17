import { describe, expect, it } from 'vitest'
import { needsReconnect } from './integrationReconnect'
import { canvasReconnectNeeded } from '../hooks/useCanvasSync'

describe('needsReconnect（#450）', () => {
  it('つなぎ直さないと直らないものだけ', () => {
    for (const code of ['notion_unauthorized', 'notion_not_shared', 'canvas_unauthorized', 'canvas_feed_invalid'])
      expect(needsReconnect(code)).toBe(true)
    for (const code of ['notion_rate_limited', 'canvas_rate_limited', 'canvas_api', 'notion_api', null, undefined, 'boom'])
      expect(needsReconnect(code)).toBe(false)
  })

  it('Canvas はどれか 1 校でも切れていれば', () => {
    const base = { syncing: false, lastSyncedAt: null, error: null }
    expect(canvasReconnectNeeded({ ...base, connectionErrors: { a: 'canvas_api' } })).toBe(false)
    expect(canvasReconnectNeeded({ ...base, connectionErrors: { a: 'canvas_api', b: 'canvas_unauthorized' } })).toBe(true)
    expect(canvasReconnectNeeded({ ...base, error: 'canvas_feed_invalid', connectionErrors: {} })).toBe(true)
  })
})
