import { describe, expect, it } from 'vitest'
import { feedFailureCode } from './feedStatus.ts'
import { needsReconnect } from '../../../src/lib/integrationReconnect'

describe('feedFailureCode', () => {
  it('URL がもう使えない応答だけ、つなぎ直し（canvas_feed_invalid）', () => {
    for (const status of [401, 403, 404, 410]) {
      expect(feedFailureCode(status)).toBe('canvas_feed_invalid')
      expect(needsReconnect(feedFailureCode(status))).toBe(true)
    }
  })

  it('学校のサーバーの一時的な失敗・送りすぎは、つなぎ直しを求めない', () => {
    expect(feedFailureCode(429)).toBe('canvas_rate_limited')
    for (const status of [500, 502, 503, 504, 408]) expect(feedFailureCode(status)).toBe('canvas_api')
    for (const status of [429, 500, 502, 503, 504, 408]) expect(needsReconnect(feedFailureCode(status))).toBe(false)
  })
})
