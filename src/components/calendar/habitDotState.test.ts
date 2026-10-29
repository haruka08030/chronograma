import { describe, expect, it } from 'vitest'
import { habitDotState } from './habitDotState'

describe('habitDotState: カレンダーの習慣の丸（習慣画面と同じ gc-mark、#641）', () => {
  it('時間外にやった日は達成と分けて時間外', () => {
    expect(habitDotState({ time: '07:00', done: true, offTime: true }, '2026-10-07', '2026-10-07', 600)).toBe('offTime')
    expect(habitDotState({ time: '07:00', done: true }, '2026-10-07', '2026-10-07', 600)).toBe('done')
    expect(habitDotState({ time: '07:00', done: false }, '2026-10-06', '2026-10-07', null)).toBe('missed')
    expect(habitDotState({ time: '21:00', done: false }, '2026-10-07', '2026-10-07', 600)).toBe('future')
  })
})
