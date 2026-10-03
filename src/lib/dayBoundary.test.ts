import { afterEach, describe, expect, it, vi } from 'vitest'
import { appTodayKey, isAppToday, isNowOnDay } from './timeZone'

describe('1 日の区切り（朝 4 時）', () => {
  afterEach(() => vi.useRealTimers())

  it('夜中の 0:30 はまだ前の日', () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 3, 0, 30) })
    expect(appTodayKey()).toBe('2026-10-02')
    expect(isAppToday(new Date(2026, 9, 2))).toBe(true)
    // 現在の線は実際の日付（10/3）に引く
    expect(isNowOnDay(new Date(2026, 9, 2))).toBe(false)
    expect(isNowOnDay(new Date(2026, 9, 3))).toBe(true)
  })

  it('4:00 からその日', () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 3, 4, 0) })
    expect(appTodayKey()).toBe('2026-10-03')
  })
})
