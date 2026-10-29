import { describe, expect, it } from 'vitest'
import { fitRect, pointRect, type Rect } from './viewportFit'

const VP: Rect = { top: 0, left: 0, right: 1280, bottom: 800 }
const inside = (f: { left: number; top: number; maxHeight: number }, w: number) => {
  expect(f.left).toBeGreaterThanOrEqual(8)
  expect(f.left + w).toBeLessThanOrEqual(1280 - 8)
  expect(f.top).toBeGreaterThanOrEqual(8)
  expect(f.top + f.maxHeight).toBeLessThanOrEqual(800 - 8)
}

describe('fitRect', () => {
  it('below: 入れば下に出す', () => {
    const f = fitRect({ width: 200, height: 300 }, { anchor: { top: 100, bottom: 120, left: 50, right: 150 }, placement: 'below' }, VP)
    expect(f.top).toBe(124)
    expect(f.left).toBe(50)
    inside(f, 200)
  })

  it('below: 画面の下で開いたら上に回す', () => {
    const f = fitRect({ width: 200, height: 300 }, { anchor: { top: 700, bottom: 720, left: 50, right: 150 }, placement: 'below' }, VP)
    expect(f.top).toBe(700 - 4 - 300)
    inside(f, 200)
  })

  it('below: 上にも下にも入らなければ画面の中に寄せて、入らない分は中でスクロール', () => {
    const f = fitRect({ width: 200, height: 2000 }, { anchor: pointRect(600, 400), placement: 'below' }, VP)
    expect(f.top).toBe(8)
    expect(f.maxHeight).toBe(800 - 16)
    inside(f, 200)
  })

  it('below + prefer above: 上に入れば上', () => {
    const f = fitRect({ width: 200, height: 100 }, { anchor: pointRect(600, 400), placement: 'below', prefer: 'above' }, VP)
    expect(f.top).toBe(400 - 4 - 100)
  })

  it('side: 夜おそく（画面の下）のブロックでは、カードを上へ寄せて全部見せる', () => {
    const f = fitRect(
      { width: 320, height: 420 },
      { anchor: { top: 760, bottom: 790, left: 400, right: 560 }, placement: 'side', gap: 8, edge: 12 },
      VP,
    )
    expect(f.left).toBe(568)
    expect(f.top).toBe(800 - 12 - 420)
    expect(f.top + f.maxHeight).toBe(800 - 12)
  })

  it('side: 右に入らなければ左', () => {
    const f = fitRect(
      { width: 320, height: 200 },
      { anchor: { top: 100, bottom: 130, left: 1000, right: 1200 }, placement: 'side', gap: 8 },
      VP,
    )
    expect(f.left).toBe(1000 - 8 - 320)
    expect(f.transformOrigin).toBe('right top')
  })

  it('side: カードが画面より高ければ上端に置いて中でスクロール', () => {
    const f = fitRect({ width: 320, height: 1200 }, { anchor: { top: 760, bottom: 790, left: 400, right: 560 }, placement: 'side' }, VP)
    inside(f, 320)
    expect(f.top).toBe(8)
  })

  it('キーボードで縮んだ画面（visualViewport）の中に収める', () => {
    const vp = { top: 0, left: 0, right: 390, bottom: 400 }
    const f = fitRect({ width: 300, height: 360 }, { anchor: { top: 300, bottom: 340, left: 20, right: 200 }, placement: 'below' }, vp)
    expect(f.top + f.maxHeight).toBeLessThanOrEqual(400 - 8)
    expect(f.left + 300).toBeLessThanOrEqual(390 - 8)
  })
})
