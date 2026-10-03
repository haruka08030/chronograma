import { describe, expect, it } from 'vitest'
import { addClockMinutes, clockOf, minutesToTime, timeToMinutes, toMinutes } from './clockTime'

describe('clockTime', () => {
  it('timeToMinutes は保存済みの HH:MM を分にし、欠けた分は 0 とみなす', () => {
    expect(timeToMinutes('07:30')).toBe(450)
    expect(timeToMinutes('24:00')).toBe(1440)
    expect(timeToMinutes('7')).toBe(420)
  })

  it('toMinutes は形の違う入力に null を返す', () => {
    expect(toMinutes('7:5')).toBe(425)
    expect(toMinutes('abc')).toBeNull()
  })

  it('minutesToTime は折り返さず 24:00 も書ける', () => {
    expect(minutesToTime(0)).toBe('00:00')
    expect(minutesToTime(605)).toBe('10:05')
    expect(minutesToTime(1440)).toBe('24:00')
  })

  it('addClockMinutes は 24 時で折り返す', () => {
    expect(addClockMinutes('23:30', 45)).toBe('00:15')
    expect(addClockMinutes('00:10', -20)).toBe('23:50')
  })

  it('clockOf は Date の壁時計を HH:MM で返す', () => {
    expect(clockOf(new Date(2026, 9, 3, 9, 5))).toBe('09:05')
  })
})
