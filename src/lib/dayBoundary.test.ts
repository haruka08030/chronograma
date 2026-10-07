import { afterEach, describe, expect, it, vi } from 'vitest'
import { appTodayKey, isAppToday, isNowOnDay } from './timeZone'

describe('1 日の区切り（0 時）', () => {
  afterEach(() => vi.useRealTimers())

  it('夜中の 0:30 はもう次の日', () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 3, 0, 30) })
    expect(appTodayKey()).toBe('2026-10-03')
    expect(isAppToday(new Date(2026, 9, 3))).toBe(true)
    expect(isNowOnDay(new Date(2026, 9, 3))).toBe(true)
  })

  it('23:59 まではその日', () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 2, 23, 59) })
    expect(appTodayKey()).toBe('2026-10-02')
  })
})
