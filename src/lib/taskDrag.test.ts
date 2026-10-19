import { describe, expect, it } from 'vitest'
import { isTinyDrag } from './taskDrag'

describe('isTinyDrag', () => {
  const press = { x: 100, y: 100, t: 1000 }

  it('どこにも落とさず、少し動かしてすぐ離したら押したことにする', () => {
    expect(isTinyDrag(press, { x: 104, y: 102 }, 1200, 'none')).toBe(true)
  })

  it('大きく動かした・長く持った・どこかに落としたときは押したことにしない', () => {
    expect(isTinyDrag(press, { x: 160, y: 100 }, 1200, 'none')).toBe(false)
    expect(isTinyDrag(press, { x: 102, y: 100 }, 2000, 'none')).toBe(false)
    expect(isTinyDrag(press, { x: 102, y: 100 }, 1200, 'move')).toBe(false)
  })
})
