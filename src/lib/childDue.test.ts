import { describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
import { TASK_DEFAULTS } from './taskDefaults'
import { nextChildDue } from './childDue'

const task = (id: string, over: Partial<Task> = {}): Task =>
  ({
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
  }) as Task

describe('nextChildDue', () => {
  it('まだ終わっていない子のうち締切がいちばん近いもの（同じ日は時刻つきが先）', () => {
    const tasks = [
      task('company'),
      task('interview', { parentId: 'company', dueDate: '2026-10-20' }),
      task('es', { parentId: 'company', dueDate: '2026-10-15' }),
      task('test', { parentId: 'company', dueDate: '2026-10-15', dueTime: '12:00' }),
      task('doneEarly', { parentId: 'company', dueDate: '2026-10-01', completed: true }),
      task('deleted', { parentId: 'company', dueDate: '2026-10-01', deletedAt: '2026-10-02T00:00:00Z' }),
      task('noDue', { parentId: 'company' }),
    ]
    expect(nextChildDue(tasks, 'company')?.id).toBe('test')
  })

  it('締切のある子が無い・全部済めば undefined', () => {
    expect(nextChildDue([task('p'), task('c', { parentId: 'p', dueDate: '2026-10-15', completed: true })], 'p')).toBeUndefined()
    expect(nextChildDue([task('p'), task('c', { parentId: 'p' })], 'p')).toBeUndefined()
  })
})
