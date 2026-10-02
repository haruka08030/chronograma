import { describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
import { todoLabels } from './todoLabels'

function task(over: Partial<Task>): Task {
  return {
    id: Math.random().toString(36).slice(2),
    title: 't',
    description: '',
    completed: false,
    completedAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
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
  }
}

describe('todoLabels', () => {
  it('counts incomplete root tasks per label, sorted by name', () => {
    const labels = todoLabels(
      [
        task({ tags: ['課題'] }),
        task({ tags: ['課題', '就活'] }),
        task({ tags: ['就活'], completed: true }),
      ],
      new Set(),
    )
    expect(labels).toEqual([
      { name: '課題', count: 2 },
      { name: '就活', count: 1 },
    ])
  })

  it('keeps a label whose tasks are all done, with 0', () => {
    expect(todoLabels([task({ tags: ['ゼミ'], completed: true })], new Set())).toEqual([{ name: 'ゼミ', count: 0 }])
  })

  it('leaves out records, subtasks, deleted tasks and someday/checklist lists', () => {
    const labels = todoLabels(
      [
        task({ tags: ['勉強'], isTimeLog: true }),
        task({ tags: ['子'], parentId: 'p' }),
        task({ tags: ['消した'], deletedAt: '2026-10-01T00:00:00.000Z' }),
        task({ tags: ['買い物'], listId: 'shop' }),
      ],
      new Set(['shop']),
    )
    expect(labels).toEqual([])
  })
})
