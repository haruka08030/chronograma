import { describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
import { toggleChecklistTree } from './listTree'

const NOW = '2026-10-03T10:00:00.000Z'
const task = (id: string, parentId: string | null = null, completed = false): Task => ({
  id, title: id, description: '', completed, completedAt: completed ? NOW : null, createdAt: NOW, updatedAt: NOW,
  order: 0, listId: 'shop', sectionId: null, parentId, dueDate: null, startTime: null, endTime: null,
  priority: 'none', tags: [], recurrence: null,
})
const done = (tasks: Task[] | null) => (tasks ?? []).filter((t) => t.completed).map((t) => t.id).sort()

describe('toggleChecklistTree', () => {
  const curry = () => [task('curry'), task('onion', 'curry'), task('carrot', 'curry')]

  it('親をチェックすると子もまとめてチェック、戻すとまとめて戻る', () => {
    const on = toggleChecklistTree(curry(), 'curry', NOW)
    expect(done(on)).toEqual(['carrot', 'curry', 'onion'])
    expect(done(toggleChecklistTree(on!, 'curry', NOW))).toEqual([])
  })

  it('子がそろったら親もチェック済み、1 つ戻すと親も戻る', () => {
    const one = toggleChecklistTree(curry(), 'onion', NOW)
    expect(done(one)).toEqual(['onion'])
    const both = toggleChecklistTree(one!, 'carrot', NOW)
    expect(done(both)).toEqual(['carrot', 'curry', 'onion'])
    expect(done(toggleChecklistTree(both!, 'onion', NOW))).toEqual(['carrot'])
  })

  it('消した子は数えない', () => {
    const tasks = [...curry(), { ...task('meat', 'curry'), deletedAt: NOW }]
    const a = toggleChecklistTree(tasks, 'onion', NOW)
    expect(done(toggleChecklistTree(a!, 'carrot', NOW))).toEqual(['carrot', 'curry', 'onion'])
  })

  it('無い id は null', () => {
    expect(toggleChecklistTree(curry(), 'nope', NOW)).toBeNull()
  })
})
