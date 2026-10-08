import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ActiveTimer } from '../store/storeTypes'
import type { Task } from '../types/task'
import { endsAfter, normalizeEndsAt, planEndFor } from './timerLength'
import { setAppTimeZoneSetting } from './timeZone'

const START = '2026-10-08T00:00:00.000Z'
const timer = (patch: Partial<ActiveTimer> = {}): ActiveTimer => ({ taskTitle: 'レポート', startedAt: START, tags: [], ...patch })

describe('normalizeEndsAt', () => {
  it('始めた時刻より後で 1 日以内の終わりだけ、ISO の UTC にそろえる', () => {
    expect(normalizeEndsAt('2026-10-08T09:25:00+09:00', START)).toBe('2026-10-08T00:25:00.000Z')
    expect(normalizeEndsAt(START, START)).toBeNull()
    expect(normalizeEndsAt('2026-10-07T23:00:00.000Z', START)).toBeNull()
    expect(normalizeEndsAt('2026-10-09T00:00:01.000Z', START)).toBeNull()
    expect(normalizeEndsAt('bad', START)).toBeNull()
    expect(normalizeEndsAt(undefined, START)).toBeNull()
    expect(normalizeEndsAt(null, START)).toBeNull()
  })
})

describe('endsAfter', () => {
  it('選んだ瞬間からちょうど N 分後', () => {
    expect(endsAfter(25, Date.parse(START))).toBe('2026-10-08T00:25:00.000Z')
    expect(endsAfter(90, Date.parse(START))).toBe('2026-10-08T01:30:00.000Z')
  })
})

describe('planEndFor（予定から ▶ したときの初期値）', () => {
  beforeEach(() => setAppTimeZoneSetting('Asia/Tokyo'))
  afterEach(() => {
    setAppTimeZoneSetting(null)
  })

  const plan = (patch: Partial<Task>): Task =>
    ({
      id: 'p1',
      title: 'ゼミ',
      kind: 'event',
      completed: false,
      scheduledDate: '2026-10-08',
      dueDate: null,
      endDate: null,
      startTime: '09:00',
      endTime: '10:30',
      ...patch,
    }) as Task

  it('まだ来ていない予定の終わり（アプリのタイムゾーンの壁時計）', () => {
    const now = Date.parse('2026-10-08T00:10:00.000Z') // 東京 9:10
    expect(planEndFor(timer({ taskId: 'p1' }), [plan({})], now)).toBe('2026-10-08T01:30:00.000Z')
  })

  it('0:00 終わりは翌日の 0:00', () => {
    const now = Date.parse('2026-10-08T13:10:00.000Z') // 東京 22:10
    const t = timer({ taskId: 'p1', startedAt: '2026-10-08T13:05:00.000Z' })
    expect(planEndFor(t, [plan({ startTime: '22:00', endTime: '00:00' })], now)).toBe('2026-10-08T15:00:00.000Z')
  })

  it('終わりが過ぎた・時刻が無い・元が無い・記録なら出さない', () => {
    const now = Date.parse('2026-10-08T02:00:00.000Z') // 東京 11:00
    expect(planEndFor(timer({ taskId: 'p1' }), [plan({})], now)).toBeNull()
    expect(planEndFor(timer({ taskId: 'p1' }), [plan({ startTime: null, endTime: null })], 0)).toBeNull()
    expect(planEndFor(timer({ taskId: null }), [plan({})], 0)).toBeNull()
    expect(planEndFor(timer({ taskId: 'p1' }), [plan({ kind: 'log' })], 0)).toBeNull()
  })
})
