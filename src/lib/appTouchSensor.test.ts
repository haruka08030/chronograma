// @vitest-environment jsdom
// 行に触れる判定なので DOM を使う
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SensorProps } from '@dnd-kit/core'
import { AppTouchSensor, type AppTouchSensorOptions } from './appTouchSensor'
import { endLift, getLiftState, onLiftAdd } from './touchLift'

const OPTIONS: AppTouchSensorOptions = { handleDelay: 140, liftDelay: 450, tolerance: 8 }

/** jsdom には Touch が無いので、touches / changedTouches を付けたイベントで代わりにする */
type P = { id: number; x: number; y: number }
/** `touching` は画面に触れている指（既定: touchend は無し、ほかは changed と同じ） */
function touchEvent(type: string, target: EventTarget, touches: P[], touching: P[] = type === 'touchend' ? [] : touches) {
  const e = new Event(type, { bubbles: true, cancelable: true })
  const toList = (ps: P[]) => {
    const list = ps.map((t) => ({ identifier: t.id, clientX: t.x, clientY: t.y, target }))
    return Object.assign([...list], { length: list.length })
  }
  Object.defineProperty(e, 'changedTouches', { value: toList(touches) })
  Object.defineProperty(e, 'touches', { value: toList(touching) })
  return e
}

/** 押さえている指（id 1）が残ったまま、別の指（id 2）でタップする */
function tapWithOtherFinger(target: Element) {
  const held = { id: 1, x: 100, y: 100 }
  const other = { id: 2, x: 10, y: 300 }
  target.dispatchEvent(touchEvent('touchstart', target, [other], [held, other]))
  target.dispatchEvent(touchEvent('touchend', target, [other], [held]))
}

function setup(id: string, target: Element) {
  const start = touchEvent('touchstart', target, [{ id: 1, x: 100, y: 100 }])
  target.dispatchEvent(start)
  const props = {
    active: id,
    activeNode: {} as never,
    event: start,
    context: { current: {} } as never,
    options: OPTIONS,
    onAbort: vi.fn(),
    onPending: vi.fn(),
    onStart: vi.fn(),
    onCancel: vi.fn(),
    onMove: vi.fn(),
    onEnd: vi.fn(),
  } satisfies SensorProps<AppTouchSensorOptions>
  new AppTouchSensor(props)
  return props
}

beforeEach(() => {
  vi.useFakeTimers()
  document.body.innerHTML = `
    <div data-task-row="a" data-touch-lift><span id="a-title">a</span></div>
    <div data-task-row="b"><span id="b-title">b</span></div>
    <button id="grip">⠿</button>`
})
afterEach(() => {
  endLift()
  vi.useRealTimers()
})

const el = (id: string) => document.getElementById(id)!

describe('AppTouchSensor: 行の長押し', () => {
  it('長押しで浮かせ（ドラッグを始め）、その行を選択に足す。待つ長さは長押しと同じ', () => {
    const added: string[] = []
    const off = onLiftAdd((id) => added.push(id))
    const props = setup('task::a', el('a-title'))
    vi.advanceTimersByTime(OPTIONS.handleDelay)
    expect(props.onStart).not.toHaveBeenCalled()
    vi.advanceTimersByTime(OPTIONS.liftDelay - OPTIONS.handleDelay)
    expect(props.onStart).toHaveBeenCalledWith({ x: 100, y: 100 })
    expect(getLiftState().rowId).toBe('a')
    expect(added).toEqual(['a'])
    off()
  })

  it('動かさずに離したら運ばない（onCancel。選んだ状態を残す）', () => {
    const props = setup('task::a', el('a-title'))
    vi.advanceTimersByTime(OPTIONS.liftDelay)
    el('a-title').dispatchEvent(touchEvent('touchmove', el('a-title'), [{ id: 1, x: 103, y: 104 }]))
    const up = touchEvent('touchend', el('a-title'), [{ id: 1, x: 103, y: 104 }])
    el('a-title').dispatchEvent(up)
    expect(props.onCancel).toHaveBeenCalledTimes(1)
    expect(props.onEnd).not.toHaveBeenCalled()
    // 離した直後の click（行を開く）を出さない
    expect(up.defaultPrevented).toBe(true)
    expect(getLiftState().rowId).toBeNull()
  })

  it('押さえている指を動かしたら運び、離すと落とす（onEnd）', () => {
    const props = setup('task::a', el('a-title'))
    vi.advanceTimersByTime(OPTIONS.liftDelay)
    expect(getLiftState().moving).toBe(false)
    el('a-title').dispatchEvent(touchEvent('touchmove', el('a-title'), [{ id: 1, x: 100, y: 160 }]))
    expect(getLiftState().moving).toBe(true)
    expect(props.onMove).toHaveBeenLastCalledWith({ x: 100, y: 160 })
    el('a-title').dispatchEvent(touchEvent('touchend', el('a-title'), [{ id: 1, x: 100, y: 160 }]))
    expect(props.onEnd).toHaveBeenCalledTimes(1)
    expect(props.onCancel).not.toHaveBeenCalled()
  })

  it('別の指が同じ行で離れても、押さえている指が離れるまで続ける', () => {
    const props = setup('task::a', el('a-title'))
    vi.advanceTimersByTime(OPTIONS.liftDelay)
    el('a-title').dispatchEvent(touchEvent('touchend', el('a-title'), [{ id: 2, x: 10, y: 10 }], [{ id: 1, x: 100, y: 100 }]))
    expect(props.onEnd).not.toHaveBeenCalled()
    expect(props.onCancel).not.toHaveBeenCalled()
  })

  it('押さえている間の別の指のタップで、他の行を足す', () => {
    const added: string[] = []
    const off = onLiftAdd((id) => added.push(id))
    setup('task::a', el('a-title'))
    vi.advanceTimersByTime(OPTIONS.liftDelay)
    tapWithOtherFinger(el('b-title'))
    expect(added).toEqual(['a', 'b'])
    off()
  })

  it('サブタスクを浮かせたときは別の指で足さない（束にして運べない）', () => {
    const added: string[] = []
    const off = onLiftAdd((id) => added.push(id))
    setup('subtask::a', el('a-title'))
    vi.advanceTimersByTime(OPTIONS.liftDelay)
    tapWithOtherFinger(el('b-title'))
    expect(added).toEqual(['a'])
    off()
  })

  it('待っている間に動いたら（スクロール・横払い）浮かせない', () => {
    const props = setup('task::a', el('a-title'))
    vi.advanceTimersByTime(200)
    el('a-title').dispatchEvent(touchEvent('touchmove', el('a-title'), [{ id: 1, x: 100, y: 130 }]))
    vi.advanceTimersByTime(OPTIONS.liftDelay)
    expect(props.onStart).not.toHaveBeenCalled()
    expect(props.onAbort).toHaveBeenCalledWith('task::a')
    expect(props.onCancel).toHaveBeenCalledTimes(1)
    expect(getLiftState().rowId).toBeNull()
  })

  it('長押しの前に離したら（タップ）何もしない', () => {
    const props = setup('task::a', el('a-title'))
    vi.advanceTimersByTime(100)
    const up = touchEvent('touchend', el('a-title'), [{ id: 1, x: 100, y: 100 }])
    el('a-title').dispatchEvent(up)
    expect(props.onStart).not.toHaveBeenCalled()
    expect(props.onAbort).toHaveBeenCalledWith('task::a')
    // タップの click（行を開く）は止めない
    expect(up.defaultPrevented).toBe(false)
  })
})

describe('AppTouchSensor: つまみ', () => {
  it('つまみからは短い待ちで持ち上げ、浮かせない。動かさずに離しても落とす（今までどおり）', () => {
    const props = setup('section::x', el('grip'))
    vi.advanceTimersByTime(OPTIONS.handleDelay)
    expect(props.onStart).toHaveBeenCalled()
    expect(getLiftState().rowId).toBeNull()
    el('grip').dispatchEvent(touchEvent('touchend', el('grip'), [{ id: 1, x: 100, y: 100 }]))
    expect(props.onEnd).toHaveBeenCalledTimes(1)
  })
})
