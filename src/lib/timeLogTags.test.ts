import { describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
import { frequentLogLabels } from './timeLogTags'
import { TASK_DEFAULTS } from './taskDefaults'

function log(category: string | null): Task {
  return {
    ...TASK_DEFAULTS,
    id: Math.random().toString(36).slice(2),
    title: 't',
    description: '',
    completed: true,
    completedAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    order: 0,
    listId: 'inbox',
    sectionId: null,
    parentId: null,
    dueDate: '2026-10-01',
    startTime: '09:00',
    endTime: '10:00',
    priority: 'none',
    tags: category ? [category] : [],
    category,
    recurrence: null,
    kind: 'log',
  }
}

describe('frequentLogLabels', () => {
  it('よく付けたラベルから並べ、同数・未使用は設定の並び順', () => {
    const tasks = [log('バイト'), log('就活'), log('就活'), log(null)]
    expect(frequentLogLabels(['勉強', 'バイト', '就活'], tasks, 5)).toEqual(['就活', 'バイト', '勉強'])
  })

  it('件数で切る', () => {
    expect(frequentLogLabels(['a', 'b', 'c'], [], 2)).toEqual(['a', 'b'])
  })
})
