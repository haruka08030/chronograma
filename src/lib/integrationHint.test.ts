// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { RECHECK_MS, knownNotConnected, noteIntegrationConnected } from './integrationHint'

beforeEach(() => localStorage.clear())

describe('integrationHint（#445）', () => {
  it('つないでいないと分かったら、しばらくは呼ばない。その人・その連携だけ', () => {
    noteIntegrationConnected('notion', 'u1', false, 1000)
    expect(knownNotConnected('notion', 'u1', 1000 + RECHECK_MS - 1)).toBe(true)
    expect(knownNotConnected('canvas', 'u1', 1000)).toBe(false)
    expect(knownNotConnected('notion', 'u2', 1000)).toBe(false)
  })

  it('しばらくしたら確かめ直す（ほかの端末でつないだのを拾う）', () => {
    noteIntegrationConnected('canvas', 'u1', false, 0)
    expect(knownNotConnected('canvas', 'u1', RECHECK_MS)).toBe(false)
  })

  it('つないでいれば忘れる', () => {
    noteIntegrationConnected('notion', 'u1', false, 0)
    noteIntegrationConnected('notion', 'u1', true, 1)
    expect(knownNotConnected('notion', 'u1', 2)).toBe(false)
  })
})
