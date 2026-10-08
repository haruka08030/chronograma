import { afterEach, describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
import { computeTaskStats } from './taskStats'
import { setAppTimeZoneSetting } from './timeZone'
import { TASK_DEFAULTS } from './taskDefaults'

const task = (id: string, over: Partial<Task> = {}): Task => ({
  ...TASK_DEFAULTS,
  id,
  title: id,
  description: '',
  completed: false,
  completedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  order: 0,
  listId: 'inbox',
  sectionId: null,
  parentId: null,
  dueDate: null,
  startTime: null,
  endTime: null,
  priority: 'none',
  tags: [],
  recurrence: null,
  ...over,
})

const done = (id: string, completedAt: string) => task(id, { completed: true, completedAt })

describe('computeTaskStats', () => {
  afterEach(() => setAppTimeZoneSetting(null))

  it('夜中の完了はその日（0 時区切り）として連続日数に入る', () => {
    setAppTimeZoneSetting('Asia/Tokyo')
    const tasks = [
      done('a', '2026-10-01T17:00:00Z'), // 10/2 2:00 JST
      done('b', '2026-10-02T17:00:00Z'), // 10/3 2:00 JST
    ]
    expect(computeTaskStats(tasks, [], '2026-10-03').streak).toBe(2)
  })

  it('締切が今日より前の未完了だけを期限切れに数える', () => {
    const tasks = [
      task('a', { dueDate: '2026-10-02' }),
      task('b', { dueDate: '2026-10-03' }),
      task('c', { dueDate: '2026-10-01', completed: true, completedAt: '2026-10-01T03:00:00Z' }),
    ]
    expect(computeTaskStats(tasks, [], '2026-10-03').overdue).toBe(1)
  })
})
