import { describe, expect, it } from 'vitest'
import { relativeSyncKey } from './syncIndicatorLabel'

describe('relativeSyncKey', () => {
  const base = Date.parse('2026-09-30T12:00:00Z')
  const at = (iso: string) => relativeSyncKey(iso, base)

  it('1 分未満は「たった今」', () => {
    expect(at('2026-09-30T11:59:30Z')).toEqual({ key: 'sync.justNow', count: 0 })
  })

  it('分・時間・日で段階的に切り替える', () => {
    expect(at('2026-09-30T11:57:00Z')).toEqual({ key: 'sync.minutesAgo', count: 3 })
    expect(at('2026-09-30T09:00:00Z')).toEqual({ key: 'sync.hoursAgo', count: 3 })
    expect(at('2026-09-27T12:00:00Z')).toEqual({ key: 'sync.daysAgo', count: 3 })
  })

  it('境界: 60 分は「1 時間前」、24 時間は「1 日前」', () => {
    expect(at('2026-09-30T11:00:00Z')).toEqual({ key: 'sync.hoursAgo', count: 1 })
    expect(at('2026-09-29T12:00:00Z')).toEqual({ key: 'sync.daysAgo', count: 1 })
  })

  it('時計のずれで未来になっても負の値を出さない', () => {
    expect(at('2026-09-30T12:05:00Z')).toEqual({ key: 'sync.justNow', count: 0 })
  })

  it('壊れた値でも落ちない', () => {
    expect(at('not-a-date')).toEqual({ key: 'sync.justNow', count: 0 })
  })
})
