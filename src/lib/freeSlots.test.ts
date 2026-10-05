import { describe, expect, it } from 'vitest'
import { findFreeSlots } from './freeSlots'

const h = (hh: number, mm = 0) => hh * 60 + mm

describe('findFreeSlots', () => {
  // 14:30–14:45 出席登録、15:00–16:30 ゼミ、19:00–20:00 ジム
  const busy = [
    { start: h(14, 30), end: h(14, 45) },
    { start: h(15), end: h(16, 30) },
    { start: h(19), end: h(20) },
  ]

  it('lists the next openings that fit, skipping over busy blocks', () => {
    expect(findFreeSlots(busy, { from: h(14, 10), duration: 60 })).toEqual([h(16, 30), h(17, 30), h(20)])
  })

  it('rounds the start up to the next quarter hour', () => {
    expect(findFreeSlots(busy, { from: h(13, 2), duration: 30, count: 1 })).toEqual([h(13, 15)])
  })

  it('uses a short gap when the duration fits it', () => {
    expect(findFreeSlots(busy, { from: h(14, 45), duration: 15, count: 1 })).toEqual([h(14, 45)])
  })

  it('stops at the end of the day', () => {
    expect(findFreeSlots(busy, { from: h(22, 30), duration: 120 })).toEqual([])
  })
})
