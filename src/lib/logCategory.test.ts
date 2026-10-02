import { describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
import { inferLogCategory } from './logCategory'
import { logLabelFromTask } from './logCategoryColors'

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

const SAGE = '#33B679'
const presets = ['就活', '課題']
const colors = { 就活: SAGE, 課題: '#D50000' }

describe('To-Do から記録を作るときの分類', () => {
  it('ラベル（色に付けた名前）を分類として引き継ぐ', () => {
    expect(logLabelFromTask(task({ color: SAGE.toLowerCase() }), presets, colors)).toEqual({ tags: ['就活'], color: null })
  })

  it('タグは分類にしない', () => {
    expect(logLabelFromTask(task({ tags: ['メモ'], color: null }), presets, colors)).toEqual({ tags: [], color: null })
  })

  it('名前の無い色は、色だけ引き継ぐ', () => {
    expect(logLabelFromTask(task({ color: '#123456' }), presets, colors)).toEqual({ tags: [], color: '#123456' })
  })

  it('タイマーの元タスクからも、タグではなくラベルで引く', () => {
    const categoryHexes = presets.map((n) => [n, colors[n as keyof typeof colors]] as const)
    const tagged = task({ tags: ['メモ'] })
    const labeled = task({ tags: ['メモ'], color: SAGE })
    expect(inferLogCategory([tagged], 'ES', { sourceTaskId: tagged.id, categoryHexes })).toBeNull()
    expect(inferLogCategory([labeled], 'ES', { sourceTaskId: labeled.id, categoryHexes })).toBe('就活')
  })
})
