import { describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
import { computeTagStats } from './taskStats'
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

describe('computeTagStats', () => {
  it('タグごとに未完了・完了を数え、タグ無しは最後に 1 行', () => {
    const tasks = [
      task('a', { tags: ['ゼミ'] }),
      task('b', { tags: ['ゼミ', '就活'] }),
      done('c', '2026-10-01T03:00:00Z'),
      task('d', { tags: ['就活'], completed: true, completedAt: '2026-10-01T03:00:00Z' }),
    ]
    expect(computeTagStats(tasks, []).byTag).toEqual([
      { tag: 'ゼミ', active: 2, completed: 0 },
      { tag: '就活', active: 1, completed: 1 },
      { tag: '', active: 0, completed: 1 },
    ])
  })
})
