import { describe, expect, it } from 'vitest'
import { dueToneOf } from './dueTone'

const now = new Date(2026, 9, 5, 14, 30)

describe('dueToneOf', () => {
  it('今日の締切は時刻を過ぎたら期限切れ', () => {
    expect(dueToneOf('2026-10-05', '12:00', '2026-10-05', { now })).toBe('overdue')
    expect(dueToneOf('2026-10-05', '14:30', '2026-10-05', { now })).toBe('overdue')
    expect(dueToneOf('2026-10-05', '18:00', '2026-10-05', { now })).toBe('today')
    expect(dueToneOf('2026-10-05', null, '2026-10-05', { now })).toBe('today')
  })

  it('過ぎた日の締切は、どの日から見ても期限切れ', () => {
    expect(dueToneOf('2026-10-04', null, '2026-10-05', { now })).toBe('overdue')
    expect(dueToneOf('2026-10-04', null, '2026-10-03', { now })).toBe('overdue')
  })

  it('見ている日より前の締切は期限切れ（締切の後に置いた予定）', () => {
    expect(dueToneOf('2026-10-07', null, '2026-10-08', { now })).toBe('overdue')
  })

  it('締切の時刻以降に始まる予定は、その日でも期限切れ', () => {
    expect(dueToneOf('2026-10-07', '10:00', '2026-10-07', { now, atTime: '13:00' })).toBe('overdue')
    expect(dueToneOf('2026-10-07', '10:00', '2026-10-07', { now, atTime: '09:00' })).toBe('today')
    expect(dueToneOf('2026-10-07', null, '2026-10-07', { now, atTime: '23:00' })).toBe('today')
  })

  it('翌日とそれより先', () => {
    expect(dueToneOf('2026-10-06', null, '2026-10-05', { now })).toBe('tomorrow')
    expect(dueToneOf('2026-10-09', null, '2026-10-05', { now })).toBe('future')
  })
})
