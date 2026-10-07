import { describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
import { TASK_DEFAULTS } from './taskDefaults'
import { durationMinutesForTaskSlot, logSegmentClockOnDay, patchAfterLogResize } from './taskTimeRange'

const log = (over: Partial<Task>): Task =>
  ({
    ...TASK_DEFAULTS,
    id: 'l',
    title: 'レポート',
    description: '',
    completed: true,
    completedAt: null,
    createdAt: '2026-10-05T00:00:00Z',
    updatedAt: '2026-10-05T00:00:00Z',
    order: 0,
    listId: 'inbox',
    sectionId: null,
    parentId: null,
    kind: 'log',
    priority: 'none',
    tags: [],
    recurrence: null,
    ...over,
  }) as Task

describe('日をまたぐ記録の端を引く（#313）', () => {
  // 10/5 23:00 〜 10/6 1:00
  const overnight = log({ dueDate: '2026-10-05', endDate: '2026-10-06', startTime: '23:00', endTime: '01:00' })

  it('列ごとに描いている区間の時刻', () => {
    expect(logSegmentClockOnDay(overnight, '2026-10-05')).toEqual({ startTime: '23:00', endTime: '24:00' })
    expect(logSegmentClockOnDay(overnight, '2026-10-06')).toEqual({ startTime: '00:00', endTime: '01:00' })
  })

  it('1 日目の列で下端を 23:30 に引き上げると 23:00〜23:30 の 30 分になり、endDate が外れる', () => {
    const patch = patchAfterLogResize(overnight, '2026-10-05', '23:00', '23:30')
    expect(patch).toEqual({ dueDate: '2026-10-05', startTime: '23:00', endTime: '23:30', endDate: null })
    expect(durationMinutesForTaskSlot({ ...overnight, ...patch })).toBe(30)
  })

  it('2 日目の列で上端を 0:30 に下げると 10/6 0:30〜1:00 の 30 分になる', () => {
    const patch = patchAfterLogResize(overnight, '2026-10-06', '00:30', '01:00')
    expect(patch).toEqual({ dueDate: '2026-10-06', startTime: '00:30', endTime: '01:00', endDate: null })
    expect(durationMinutesForTaskSlot({ ...overnight, ...patch })).toBe(30)
  })

  it('2 日目の列で下端を 2:00 に伸ばすと、開始は前の日のまま 3 時間になる', () => {
    const patch = patchAfterLogResize(overnight, '2026-10-06', '00:00', '02:00')
    expect(patch).toEqual({ dueDate: '2026-10-05', startTime: '23:00', endTime: '02:00', endDate: '2026-10-06' })
    expect(durationMinutesForTaskSlot({ ...overnight, ...patch })).toBe(180)
  })
})
