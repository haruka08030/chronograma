import type React from 'react'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HOUR_HEIGHT } from './timeGrid'
import { createRangeMinutes, useTimelineDrag } from './useTimelineDrag'

const originalMatchMedia = window.matchMedia
beforeEach(() => {
  // マウス（タッチではない）
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia
})
afterEach(() => {
  window.matchMedia = originalMatchMedia
})

/** 格子の Y 座標＝clientY（列の上端が 0）。渡す関数は週の画面と同じく作り直さない */
function setup() {
  const onMoveDone = vi.fn()
  const onResizeDone = vi.fn()
  const getRelativeY = (clientY: number) => clientY
  const getDateKeyFromX = () => '2026-10-07'
  const hook = renderHook(() => useTimelineDrag({ getRelativeY, getDateKeyFromX, onMoveDone, onResizeDone }))
  return { ...hook, onMoveDone }
}

const pointer = (clientY: number, top = 0, height = HOUR_HEIGHT) =>
  ({
    clientX: 10,
    clientY,
    pointerId: 1,
    button: 0,
    currentTarget: { getBoundingClientRect: () => ({ top, height }), setPointerCapture() {} },
    stopPropagation() {},
  }) as unknown as React.PointerEvent

describe('useTimelineDrag（#265）', () => {
  it('15 分の位置が変わらない動きでは drag の state を変えない（描き直さない）', () => {
    const { result, onMoveDone } = setup()
    const top = 10 * HOUR_HEIGHT
    const y0 = top + HOUR_HEIGHT / 2
    act(() => result.current.handleBlockPointerDown(pointer(y0, top), 'p', '2026-10-07', '10:00', '11:00', null))
    // 動かし始め（7 px）で 1 回
    act(() => result.current.handlePointerMove(pointer(y0 + 7)))
    const started = result.current.drag
    // 10:00 のまま（7.5 px 未満）の動きでは同じ state
    act(() => result.current.handlePointerMove(pointer(y0 + 6)))
    act(() => result.current.handlePointerMove(pointer(y0 + 3)))
    expect(result.current.drag).toBe(started)
    // 15 分ずれたら変わる
    act(() => result.current.handlePointerMove(pointer(y0 + HOUR_HEIGHT / 4)))
    expect(result.current.drag).not.toBe(started)
    expect(result.current.dragPreview?.label).toBe('10:15 – 11:15')
    act(() => result.current.handlePointerUp())
    expect(onMoveDone).toHaveBeenCalledWith('p', '2026-10-07', '10:15', '11:15')
  })

  it('端のスクロールから呼ぶ repoint はドラッグ中に作り直さない（作り直すと端に指を止めたままのスクロールが止まる）', () => {
    const { result } = setup()
    const repoint = result.current.repoint
    const top = 10 * HOUR_HEIGHT
    act(() => result.current.handleBlockPointerDown(pointer(top + 30, top), 'p', '2026-10-07', '10:00', '11:00', null))
    for (let dy = 1; dy <= HOUR_HEIGHT; dy += 5) act(() => result.current.handlePointerMove(pointer(top + 30 + dy)))
    expect(result.current.repoint).toBe(repoint)
  })
})

describe('createRangeMinutes: 隣のブロックで止める（#599）', () => {
  const px = (min: number) => (min / 60) * HOUR_HEIGHT
  const STICK = 20
  // 10:00–11:00 の予定と、13:10–14:00 の Google の予定
  const stops = {
    dateKey: 'd',
    blocks: [
      { top: px(600), bottom: px(660) },
      { top: px(790), bottom: px(840) },
    ],
  }
  const range = (startMin: number, currentY: number) =>
    createRangeMinutes({ kind: 'create', dateKey: 'd', startY: px(startMin), currentY, intent: 'schedule', stops })

  it('下へ引いて下のブロックにぶつかったら、その始まり（15 分でなくても）で止める', () => {
    expect(range(720, px(800))).toEqual({ startMin: 720, endMin: 790 })
    expect(range(720, px(790) + STICK - 1)).toEqual({ startMin: 720, endMin: 790 })
  })

  it('境目から先まで引き続けたら止めずにカーソルに合わせる', () => {
    expect(range(720, px(790) + STICK + 1).endMin).toBeGreaterThan(790)
  })

  it('上へ引いて上のブロックにぶつかったら、その終わりで止め、引き続けたら合わせる', () => {
    expect(range(720, px(650))).toEqual({ startMin: 660, endMin: 720 })
    expect(range(720, px(660) - STICK - 1).startMin).toBeLessThan(660)
  })

  it('押した 15 分枠の頭が上のブロックに食い込むときは、その終わりから始める', () => {
    expect(range(665, px(700))).toEqual({ startMin: 660, endMin: 705 })
    const tight = { dateKey: 'd', blocks: [{ top: px(600), bottom: px(670) }] }
    expect(
      createRangeMinutes({ kind: 'create', dateKey: 'd', startY: px(672), currentY: px(700), intent: 'schedule', stops: tight }),
    ).toEqual({
      startMin: 670,
      endMin: 705,
    })
  })

  it('ほかの日の列にいる間は止めない', () => {
    expect(createRangeMinutes({ kind: 'create', dateKey: 'e', startY: px(720), currentY: px(800), intent: 'schedule', stops }).endMin).toBe(
      810,
    )
  })
})
