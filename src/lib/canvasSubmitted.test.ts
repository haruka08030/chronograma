// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import {
  bindCanvasSubmitted,
  clearCanvasSubmittedAsk,
  noteCanvasSubmitted,
  useCanvasSubmitted,
  useCanvasSubmittedAsk,
} from './canvasSubmitted'
import { canvasTaskId } from './canvas'

const A = 'a.instructure.com'
const B = 'b.instructure.com'
const a1 = canvasTaskId(A, 'assignment', '1')
const a2 = canvasTaskId(A, 'assignment', '2')
const b1 = canvasTaskId(B, 'quiz', '1')

afterEach(() => {
  bindCanvasSubmitted(null)
  localStorage.clear()
})

describe('canvasSubmitted（#395）', () => {
  it('asks once for newly submitted assignments and keeps the mark after answering', () => {
    bindCanvasSubmitted('u1')
    const ask = renderHook(() => useCanvasSubmittedAsk())
    const mark = renderHook(() => useCanvasSubmitted(a1))
    act(() => noteCanvasSubmitted(A, [a1]))
    expect(ask.result.current).toEqual([a1])
    expect(mark.result.current).toBe(true)
    act(() => clearCanvasSubmittedAsk())
    expect(ask.result.current).toEqual([])
    // 次の取り込みでも同じものは聞かない
    act(() => noteCanvasSubmitted(A, [a1]))
    expect(ask.result.current).toEqual([])
    act(() => noteCanvasSubmitted(A, [a1, a2]))
    expect(ask.result.current).toEqual([a2])
  })

  it('replaces only the given connection, and drops a redo request from the mark and the question', () => {
    bindCanvasSubmitted('u1')
    act(() => {
      noteCanvasSubmitted(A, [a1])
      noteCanvasSubmitted(B, [b1])
      noteCanvasSubmitted(A, [])
    })
    const ask = renderHook(() => useCanvasSubmittedAsk())
    expect(ask.result.current).toEqual([b1])
    expect(renderHook(() => useCanvasSubmitted(a1)).result.current).toBe(false)
    expect(renderHook(() => useCanvasSubmitted(b1)).result.current).toBe(true)
  })

  it('remembers per user on this device', () => {
    bindCanvasSubmitted('u1')
    noteCanvasSubmitted(A, [a1])
    bindCanvasSubmitted('u2')
    expect(renderHook(() => useCanvasSubmitted(a1)).result.current).toBe(false)
    bindCanvasSubmitted('u1')
    expect(renderHook(() => useCanvasSubmitted(a1)).result.current).toBe(true)
  })
})
