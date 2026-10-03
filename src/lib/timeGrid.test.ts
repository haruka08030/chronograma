import { afterAll, describe, expect, it } from 'vitest'
import i18n from '../i18n/config'
import { formatDuration, formatDurationShort } from './timeGrid'

describe('formatDuration', () => {
  const initial = i18n.language
  afterAll(() => i18n.changeLanguage(initial))

  it('日本語では「1時間15分」', async () => {
    await i18n.changeLanguage('ja')
    expect(formatDuration(75)).toBe('1時間15分')
    expect(formatDuration(120)).toBe('2時間')
    expect(formatDuration(45)).toBe('45分')
  })

  it('英語では「1h 15m」', async () => {
    await i18n.changeLanguage('en')
    expect(formatDuration(75)).toBe('1h 15m')
    expect(formatDuration(120)).toBe('2h')
    expect(formatDuration(0)).toBe('0m')
  })
})

describe('formatDurationShort', () => {
  it('時間と分を詰めて書く（分は 2 桁）', () => {
    expect(formatDurationShort(200)).toBe('3h20')
    expect(formatDurationShort(65)).toBe('1h05')
    expect(formatDurationShort(120)).toBe('2h')
  })

  it('1 時間未満は分だけ', () => {
    expect(formatDurationShort(45)).toBe('45m')
    expect(formatDurationShort(0)).toBe('0m')
  })
})
