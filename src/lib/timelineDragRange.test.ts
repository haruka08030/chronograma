import { describe, expect, it } from 'vitest'
import { createRangeMinutes, type CreateDrag } from './useTimelineDrag'
import { HOUR_HEIGHT } from './timeGrid'

/** 分 → タイムラインの y（px） */
const y = (min: number) => (min / 60) * HOUR_HEIGHT
const range = (fromMin: number, toMin: number, maxMin?: number) =>
  createRangeMinutes({
    kind: 'create',
    dateKey: '2026-10-08',
    startY: y(fromMin),
    currentY: y(toMin),
    intent: 'schedule',
    ...(maxMin !== undefined ? { maxY: y(maxMin) } : {}),
  } satisfies CreateDrag)

describe('ドラッグで予定を作る範囲（createRangeMinutes）', () => {
  it('押した 15 分枠の頭から、指している 15 分枠の終わりまで', () => {
    expect(range(9 * 60 + 7, 10 * 60 + 2)).toEqual({ startMin: 9 * 60, endMin: 10 * 60 + 15 })
    expect(range(9 * 60, 10 * 60)).toEqual({ startMin: 9 * 60, endMin: 10 * 60 })
  })

  it('上へ引いても同じ範囲になる', () => {
    expect(range(10 * 60 + 2, 9 * 60 + 7)).toEqual(range(9 * 60 + 7, 10 * 60 + 2))
  })

  it('同じ枠の中でも最低 15 分', () => {
    expect(range(9 * 60 + 1, 9 * 60 + 2)).toEqual({ startMin: 9 * 60, endMin: 9 * 60 + 15 })
  })

  it('日の終わりを越えない（23:45 で止め、始まりは 23:30 まで）。上は 0:00 で止める', () => {
    expect(range(23 * 60 + 50, 24 * 60 + 30)).toEqual({ startMin: 23 * 60 + 30, endMin: 23 * 60 + 45 })
    expect(range(22 * 60, 24 * 60)).toEqual({ startMin: 22 * 60, endMin: 23 * 60 + 45 })
    expect(range(-30, 30)).toEqual({ startMin: 0, endMin: 30 })
  })

  it('記録は今より先に作らない（終わりを今で止める）', () => {
    expect(range(9 * 60, 10 * 60 + 5, 10 * 60 + 7)).toEqual({ startMin: 9 * 60, endMin: 10 * 60 + 7 })
    expect(range(9 * 60, 9 * 60 + 40, 12 * 60)).toEqual({ startMin: 9 * 60, endMin: 9 * 60 + 45 })
  })
})
