import type React from 'react'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HOUR_HEIGHT } from './timeGrid'
import { useTimelineDrag } from './useTimelineDrag'

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
