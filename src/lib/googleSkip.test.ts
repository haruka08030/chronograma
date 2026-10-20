import { describe, expect, it } from 'vitest'
import { isGoogleSkipped, normalizeGoogleSkip, withGoogleSkip } from './googleSkip'

describe('googleSkip', () => {
  it('切り替えると足す・外す。同じ名前（全角半角・大文字小文字・空白の違い）は 1 つ', () => {
    const one = withGoogleSkip([], '移動', true)
    expect(one).toEqual(['移動'])
    expect(withGoogleSkip(one, ' 移動 ', true)).toEqual(['移動'])
    expect(isGoogleSkipped(one, '移動 ')).toBe(true)
    expect(isGoogleSkipped(one, '新宿へ移動')).toBe(false)
    expect(withGoogleSkip(['ＳＰＩ 対策', '移動'], 'spi  対策', false)).toEqual(['移動'])
    expect(withGoogleSkip(one, '  ', true)).toEqual(['移動'])
  })

  it('読んだ値は文字以外・空・重なりを落とす', () => {
    expect(normalizeGoogleSkip(null)).toEqual([])
    expect(normalizeGoogleSkip(['移動', 1, '', '移動 ', '面接対策'])).toEqual(['移動', '面接対策'])
  })
})
