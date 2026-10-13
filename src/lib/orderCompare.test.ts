import { describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
import { compareByOrder } from './orderCompare'
import { getFilteredRootTasks } from './mainListTasks'
import { TASK_DEFAULTS } from './taskDefaults'

const task = (id: string, order: number): Task => ({
  ...TASK_DEFAULTS,
  id,
  title: id,
  description: '',
  completed: false,
  completedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  order,
  listId: 'inbox',
  sectionId: null,
  parentId: null,
  dueDate: null,
  startTime: null,
  endTime: null,
  priority: 'none',
  tags: [],
  recurrence: null,
})

describe('同じ order の行の並び（#357）', () => {
  it('order が違えば order の順、同じなら id の文字コード順', () => {
    const rows = [
      { id: 'b', order: 1 },
      { id: 'c', order: 0 },
      { id: 'a', order: 1 },
      { id: 'B', order: 1 },
    ]
    expect([...rows].sort(compareByOrder).map((r) => r.id)).toEqual(['c', 'B', 'a', 'b'])
  })

  it('端末ごとに行の届いた順が違っても、一覧の並びは同じ', () => {
    const rows = [task('t-2', 5), task('t-1', 5), task('t-3', 5), task('t-0', 1)]
    const input = (tasks: Task[]) => ({
      tasks,
      selectedView: null,
      selectedListId: 'inbox',
      sortMode: 'manual' as const,
      filterTag: null,
      sections: [],
    })
    const deviceA = getFilteredRootTasks(input(rows)).map((t) => t.id)
    const deviceB = getFilteredRootTasks(input([...rows].reverse())).map((t) => t.id)
    expect(deviceA).toEqual(['t-0', 't-1', 't-2', 't-3'])
    expect(deviceB).toEqual(deviceA)
  })
})
