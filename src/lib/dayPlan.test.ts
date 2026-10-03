import { describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
import { getDayPlan, getMoreSuggestions } from './dayPlan'
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

const DAY = '2026-09-30'

describe('getMoreSuggestions', () => {
  const tasks = [
    task('today', { scheduledDate: DAY }),
    task('carry', { scheduledDate: '2026-09-28' }),
    task('soon', { scheduledDate: '2026-10-01', dueDate: '2026-10-02' }),
    task('dueFar', { dueDate: '2026-10-20' }),
    task('dueNear', { dueDate: '2026-10-05' }),
    task('undated2', { order: 2 }),
    task('undated1', { order: 1 }),
    task('placedLater', { scheduledDate: '2026-10-10' }),
    task('done', { completed: true }),
    task('child', { parentId: 'undated1' }),
    task('someday', { listId: 'someday' }),
    task('log', { isTimeLog: true, dueDate: '2026-10-10' }),
    task('deleted', { deletedAt: '2026-09-01T00:00:00Z' }),
  ]

  it('orders later deadlines, then undated, then later placements', () => {
    expect(getMoreSuggestions(tasks, DAY, new Set(['someday'])).map((t) => t.id)).toEqual([
      'dueNear',
      'dueFar',
      'undated1',
      'undated2',
      'placedLater',
    ])
  })

  it('never repeats what getDayPlan already shows', () => {
    const plan = getDayPlan(tasks, DAY)
    const shown = new Set([...plan.overdue, ...plan.open, ...plan.carryOver, ...plan.dueSoon].map((t) => t.id))
    expect(getMoreSuggestions(tasks, DAY).some((t) => shown.has(t.id))).toBe(false)
  })
})

describe('getDayPlan overdue', () => {
  const tasks = [
    task('pastDue', { dueDate: '2026-09-29' }),
    task('olderDue', { dueDate: '2026-09-20' }),
    // 先の日にやると決めていても、締切が過ぎていれば期限切れ
    task('placedLaterButDue', { scheduledDate: '2026-10-05', dueDate: '2026-09-28' }),
    task('carryNoDue', { scheduledDate: '2026-09-28' }),
    task('todayDue', { dueDate: DAY }),
    task('doneDue', { dueDate: '2026-09-29', completed: true }),
  ]

  it('collects every unfinished past-due task, oldest deadline first', () => {
    const plan = getDayPlan(tasks, DAY)
    expect(plan.overdue.map((t) => t.id)).toEqual(['olderDue', 'placedLaterButDue', 'pastDue'])
    expect(plan.carryOver.map((t) => t.id)).toEqual(['carryNoDue'])
    expect(plan.open.map((t) => t.id)).toEqual(['todayDue'])
  })

  it('keeps past-due tasks out of the later suggestions', () => {
    expect(getMoreSuggestions(tasks, DAY).map((t) => t.id)).toEqual([])
  })
})
