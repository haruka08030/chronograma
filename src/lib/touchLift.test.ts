// @vitest-environment jsdom
// 行に触れる判定なので DOM を使う
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  LIFT_TAP_MAX_MS,
  addExtraTouches,
  endLift,
  endTouches,
  getLiftState,
  hasLiftMoved,
  isLiftActive,
  isTouchLiftEvent,
  markLiftMoving,
  onLiftAdd,
  rowIdOfTarget,
  startLift,
} from './touchLift'

afterEach(() => {
  endLift()
  document.body.innerHTML = ''
})

describe('別の指のタップ（endTouches）', () => {
  const started = addExtraTouches(new Map(), [{ id: 2, x: 100, y: 200, rowId: 'b' }], 1000)

  it('すぐ離した別の指はタップとして、その行を返す', () => {
    const r = endTouches(started, [{ id: 2, x: 103, y: 202 }], 1150)
    expect(r.tappedRowIds).toEqual(['b'])
    expect(r.primaryEnded).toBe(false)
    expect(r.extras.size).toBe(0)
  })

  it('動かした・長く押さえた・取り消された指は足さない', () => {
    expect(endTouches(started, [{ id: 2, x: 140, y: 200 }], 1100).tappedRowIds).toEqual([])
    expect(endTouches(started, [{ id: 2, x: 100, y: 200 }], 1000 + LIFT_TAP_MAX_MS + 1).tappedRowIds).toEqual([])
    expect(endTouches(started, [{ id: 2, x: 100, y: 200 }], 1100, true).tappedRowIds).toEqual([])
  })

  it('行の外のタップは足さない', () => {
    const outside = addExtraTouches(new Map(), [{ id: 3, x: 0, y: 0, rowId: null }], 0)
    expect(endTouches(outside, [{ id: 3, x: 0, y: 0 }], 50).tappedRowIds).toEqual([])
  })

  it('浮かせる前から触れていた指（押さえている指）が離れたら primaryEnded', () => {
    const r = endTouches(started, [{ id: 1, x: 0, y: 0 }], 1100)
    expect(r.primaryEnded).toBe(true)
    expect(r.tappedRowIds).toEqual([])
    expect(r.extras.size).toBe(1)
  })
})

describe('押さえている指の動き（hasLiftMoved）', () => {
  it('少しのぶれは動かしたことにしない（離せば選ぶだけ）', () => {
    expect(hasLiftMoved({ x: 0, y: 0 }, { x: 4, y: 5 })).toBe(false)
    expect(hasLiftMoved({ x: 0, y: 0 }, { x: 0, y: 12 })).toBe(true)
  })
})

describe('行の見つけ方', () => {
  it('触れた要素から行の id と、浮かせられる行かを見る', () => {
    document.body.innerHTML = `
      <div data-task-row="a" data-touch-lift><button id="in-lift">t</button></div>
      <div data-task-row="b"><span id="in-plain">t</span></div>
      <button id="grip">⠿</button>`
    const inLift = document.getElementById('in-lift')!
    expect(rowIdOfTarget(inLift)).toBe('a')
    expect(rowIdOfTarget(document.getElementById('in-plain'))).toBe('b')
    expect(rowIdOfTarget(document.getElementById('grip'))).toBeNull()

    const fire = (el: Element, type: string) => {
      const e = new Event(type, { bubbles: true })
      el.dispatchEvent(e)
      return e
    }
    expect(isTouchLiftEvent(fire(inLift, 'touchstart'))).toBe(true)
    expect(isTouchLiftEvent(fire(document.getElementById('grip')!, 'touchstart'))).toBe(false)
    expect(isTouchLiftEvent(fire(inLift, 'mousedown'))).toBe(false)
    expect(isTouchLiftEvent(null)).toBe(false)
  })
})

/** jsdom には Touch が無いので、changedTouches を付けたイベントで代わりにする */
/** `touching` は画面に触れている指の数（既定: 置いた指と、押さえている指 1 本） */
function touchEvent(type: string, touches: { id: number; x: number; y: number; target: EventTarget }[], touching = touches.length + 1) {
  const e = new Event(type, { bubbles: true, cancelable: true })
  const list = touches.map((t) => ({ identifier: t.id, clientX: t.x, clientY: t.y, target: t.target }))
  Object.defineProperty(e, 'changedTouches', { value: Object.assign([...list], { length: list.length }) })
  Object.defineProperty(e, 'touches', { value: { length: touching } })
  return e
}

describe('浮かせている間（startLift）', () => {
  it('浮かせた行を足し、押さえたまま別の指でタップした行も足す。押さえている指が離れたら終わる', () => {
    document.body.innerHTML = `<div data-task-row="a"></div><div data-task-row="b"><span id="b-title"></span></div>`
    const added: string[] = []
    const off = onLiftAdd((id) => added.push(id))
    startLift('a')
    expect(isLiftActive()).toBe(true)
    expect(added).toEqual(['a'])

    const b = document.getElementById('b-title')!
    const down = touchEvent('touchstart', [{ id: 7, x: 10, y: 10, target: b }])
    b.dispatchEvent(down)
    // 別の指は行を開く click・ピンチに渡さない
    expect(down.defaultPrevented).toBe(true)
    b.dispatchEvent(touchEvent('touchend', [{ id: 7, x: 11, y: 10, target: b }]))
    expect(added).toEqual(['a', 'b'])

    markLiftMoving()
    expect(getLiftState().moving).toBe(true)

    // 浮かせる前から触れていた指（id 1）が離れた
    document.body.dispatchEvent(touchEvent('touchend', [{ id: 1, x: 0, y: 0, target: document.body }]))
    expect(isLiftActive()).toBe(false)
    expect(getLiftState().moving).toBe(false)

    // 終わった後のタップは足さない
    b.dispatchEvent(touchEvent('touchstart', [{ id: 8, x: 10, y: 10, target: b }]))
    b.dispatchEvent(touchEvent('touchend', [{ id: 8, x: 10, y: 10, target: b }]))
    expect(added).toEqual(['a', 'b'])
    off()
  })

  it('押さえていた指の離れを取りこぼしたら（行が消えたなど）、次のタッチで終えて、そのタッチは止めない', () => {
    document.body.innerHTML = `<div data-task-row="b" id="b"></div>`
    const listener = vi.fn()
    const off = onLiftAdd(listener)
    startLift('a')
    const b = document.getElementById('b')!
    const down = touchEvent('touchstart', [{ id: 9, x: 0, y: 0, target: b }], 1)
    b.dispatchEvent(down)
    expect(isLiftActive()).toBe(false)
    expect(down.defaultPrevented).toBe(false)
    b.dispatchEvent(touchEvent('touchend', [{ id: 9, x: 0, y: 0, target: b }], 0))
    expect(listener.mock.calls).toEqual([['a']])
    off()
  })

  it('extraTaps: false（サブタスク）は別の指で足さない', () => {
    document.body.innerHTML = `<div data-task-row="b" id="b"></div>`
    const listener = vi.fn()
    const off = onLiftAdd(listener)
    startLift('a', { extraTaps: false })
    const b = document.getElementById('b')!
    b.dispatchEvent(touchEvent('touchstart', [{ id: 7, x: 0, y: 0, target: b }]))
    b.dispatchEvent(touchEvent('touchend', [{ id: 7, x: 0, y: 0, target: b }]))
    expect(listener.mock.calls).toEqual([['a']])
    off()
  })
})
