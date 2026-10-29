import { describe, expect, it } from 'vitest'
import { createRangeMinutes, moveStartMinutes, resizeEdgeMinutes, type CreateDrag, type MoveDrag, type ResizeDrag } from './useTimelineDrag'
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

describe('動かす・伸び縮みさせる端を、ほかのブロックの境目で止める（moveStartMinutes・resizeEdgeMinutes）', () => {
  const D = '2026-10-08'
  /** 13:00–16:10 の予定（16:10 は 15 分の刻みに無い） */
  const stops = [{ top: y(13 * 60), bottom: y(16 * 60 + 10) }]
  const top = (atMin: number, withStops = true) =>
    resizeEdgeMinutes({
      kind: 'resize',
      taskId: 'a',
      dateKey: D,
      edge: 'top',
      origStartTime: '16:30',
      origEndTime: '17:30',
      currentY: y(atMin),
      ...(withStops ? { stops } : {}),
    } satisfies ResizeDrag)
  const move = (startAtMin: number, dateKey = D) =>
    moveStartMinutes({
      kind: 'move',
      taskId: 'a',
      origDateKey: D,
      origStartTime: '16:30',
      origEndTime: '17:30',
      dateKey,
      offsetY: 0,
      currentY: y(startAtMin),
      blockDurationMinutes: 60,
      stops,
    } satisfies MoveDrag)

  it('上の端を上へ引くと、15 分に丸めた時刻が上の予定に入るところで 16:10 に止まる', () => {
    expect(top(16 * 60 + 12)).toBe(16 * 60 + 15)
    expect(top(16 * 60 + 7)).toBe(16 * 60 + 10)
    expect(top(16 * 60 - 5)).toBe(16 * 60 + 10)
    // 止めないと 15 分に引っ張られる
    expect(top(16 * 60 + 7, false)).toBe(16 * 60)
  })

  it('境目より奥まで引いたら越えて、15 分に合わせる', () => {
    expect(top(15 * 60 + 30)).toBe(15 * 60 + 30)
  })

  it('動かすときも上の端が 16:10 で止まり、下の端は下の予定の始まりで止まる', () => {
    expect(move(16 * 60 + 5)).toBe(16 * 60 + 10)
    const below = moveStartMinutes({
      kind: 'move',
      taskId: 'a',
      origDateKey: D,
      origStartTime: '10:00',
      origEndTime: '11:00',
      dateKey: D,
      offsetY: 0,
      currentY: y(12 * 60 + 10),
      blockDurationMinutes: 60,
      stops,
    } satisfies MoveDrag)
    // 12:15 に丸めると下の端 13:15 が 13:00 の予定に入る → 終わりを 13:00 にそろえて 12:00 から
    expect(below).toBe(12 * 60)
  })

  it('動かす前から重なっていたブロックでは止めない', () => {
    const overlapping = [{ top: y(16 * 60), bottom: y(17 * 60) }]
    expect(
      resizeEdgeMinutes({
        kind: 'resize',
        taskId: 'a',
        dateKey: D,
        edge: 'top',
        origStartTime: '16:30',
        origEndTime: '17:30',
        currentY: y(16 * 60 + 2),
        stops: overlapping,
      }),
    ).toBe(16 * 60)
  })
})
