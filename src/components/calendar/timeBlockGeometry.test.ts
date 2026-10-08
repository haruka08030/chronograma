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

describe('日をまたぐ Google の予定のブロック', () => {
  const night = { id: 'g', title: '', startTime: '22:00', endTime: '02:00', completed: false }
  it('始まった日の区間 22:00–24:00 は 2 時間の高さ', () => {
    const g = blockGeometry({ ...night, segment: { startTime: '22:00', endTime: '24:00' } }, '2026-10-06', false)
    expect(g.top).toBe(22 * HOUR_HEIGHT)
    expect(g.height).toBe(2 * HOUR_HEIGHT)
  })
  it('翌日の区間 0:00–2:00 は 0 時から 2 時間', () => {
    const g = blockGeometry({ ...night, segment: { startTime: '00:00', endTime: '02:00' } }, '2026-10-07', false)
    expect(g.top).toBe(0)
    expect(g.height).toBe(2 * HOUR_HEIGHT)
  })
})
