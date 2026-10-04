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

  it('夜中（朝 4 時まで）の完了は前の日として連続日数に入る', () => {
    setAppTimeZoneSetting('Asia/Tokyo')
    const tasks = [
      // 10/3 の 2:00（JST）に完了 → アプリでは 10/2
      done('a', '2026-10-02T17:00:00Z'),
      done('b', '2026-10-03T03:00:00Z'), // 10/3 12:00 JST
    ]
    expect(computeTaskStats(tasks, [], '2026-10-03').streak).toBe(2)
  })

  it('今月の完了は月初の朝 4 時から数える', () => {
    setAppTimeZoneSetting('Asia/Tokyo')
    const tasks = [
      done('a', '2026-09-30T18:00:00Z'), // 10/1 3:00 JST → 9/30
      done('b', '2026-09-30T20:00:00Z'), // 10/1 5:00 JST → 10/1
    ]
    expect(computeTaskStats(tasks, [], '2026-10-03').completedThisMonth).toBe(1)
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
