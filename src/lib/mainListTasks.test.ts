import { describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
import { getFilteredRootTasks } from './mainListTasks'

const task = (id: string, over: Partial<Task> = {}): Task => ({
  id,
  title: id,
  description: '',
  completed: false,
  completedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  order: 0,
  listId: 'canvas',
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

describe('getFilteredRootTasks dueDate sort', () => {
  it('orders across sections by date, then by deadline time (no time = end of day)', () => {
    const tasks = [
      task('econ-late', { sectionId: 'econ', dueDate: '2026-10-05', dueTime: '23:59', order: 0 }),
      task('cse-noon', { sectionId: 'cse', dueDate: '2026-10-05', dueTime: '12:00', order: 1 }),
      task('econ-dayonly', { sectionId: 'econ', dueDate: '2026-10-05', order: 2 }),
      task('cse-tomorrow', { sectionId: 'cse', dueDate: '2026-10-04', dueTime: '23:59', order: 3 }),
      task('none', { order: 4 }),
    ]
    const ids = getFilteredRootTasks({
      tasks,
      selectedView: null,
      selectedListId: 'canvas',
      sortMode: 'dueDate',
      filterTag: null,
      sections: [],
    }).map((t) => t.id)
    expect(ids).toEqual(['cse-tomorrow', 'cse-noon', 'econ-late', 'econ-dayonly', 'none'])
  })
})
