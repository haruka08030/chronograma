import { describe, expect, it } from 'vitest'
import type { Task } from '../../types/task'
import { HOUR_HEIGHT } from '../../lib/timeGrid'
import { minutesOfLogOnCalendarDay } from '../../lib/taskTimeRange'
import { blockGeometry } from './timeBlockGeometry'

describe('0:00 に終わるブロック', () => {
  it('予定 23:00–0:00 は 1 時間の高さ', () => {
    const g = blockGeometry({ id: 'p', title: '', startTime: '23:00', endTime: '00:00', completed: false }, '2026-10-03', false)
    expect(g.top).toBe(23 * HOUR_HEIGHT)
    expect(g.height).toBe(HOUR_HEIGHT)
  })
  it('記録 23:00–0:00 は 1 時間の高さで 60 分', () => {
    const log = { id: 'l', title: '', kind: 'log' as const, completed: false, dueDate: '2026-10-03', startTime: '23:00', endTime: '00:00' }
    expect(blockGeometry(log, '2026-10-03', true).height).toBe(HOUR_HEIGHT)
    expect(minutesOfLogOnCalendarDay(log as Task, '2026-10-03')).toBe(60)
  })
})
