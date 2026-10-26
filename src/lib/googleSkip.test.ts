import { describe, expect, it } from 'vitest'
import { googleSkipKey, googleSkipKeys, normalizeGoogleSkip } from './googleSkip'

describe('googleSkip', () => {
  it('同じ名前（全角半角・大文字小文字・空白の違い）は 1 つ。部分一致はしない', () => {
    const keys = googleSkipKeys(['ＳＰＩ 対策', '移動'])
    expect(keys.has(googleSkipKey('spi  対策'))).toBe(true)
    expect(keys.has(googleSkipKey(' 移動 '))).toBe(true)
    expect(keys.has(googleSkipKey('新宿へ移動'))).toBe(false)
  })

  it('読んだ値は文字以外・空・重なりを落とす', () => {
    expect(normalizeGoogleSkip(null)).toEqual([])
    expect(normalizeGoogleSkip(['移動', 1, '', '移動 ', '面接対策'])).toEqual(['移動', '面接対策'])
  })
})
