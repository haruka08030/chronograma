import { afterEach, describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
import { allDayCalendarKey, getDayPlan, getMoreSuggestions } from './dayPlan'
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
    task('log', { kind: 'log', dueDate: '2026-10-10' }),
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

describe('getDayPlan done', () => {
  afterEach(() => setAppTimeZoneSetting(null))
  const doneAt = (iso: string, over: Partial<Task> = {}) => task(iso, { completed: true, completedAt: iso, ...over })

  it('lists a finished task on the day it was done, not the day it was placed', () => {
    setAppTimeZoneSetting('Asia/Tokyo')
    const tasks = [
      // 前の日に置いて今日やった
      doneAt('2026-09-30T03:00:00Z', { scheduledDate: '2026-09-29' }),
      // 日付なしを今日やった
      doneAt('2026-09-30T05:00:00Z'),
      // 今日に置いたが前の日に先にやった
      doneAt('2026-09-29T05:00:00Z', { scheduledDate: DAY }),
      // 東京の 10/1 2:00 は夜中なので 9/30
      doneAt('2026-09-30T17:00:00Z'),
      // 東京の 9/30 7:00（UTC ではまだ 9/29）
      doneAt('2026-09-29T22:00:00Z'),
    ]
    expect(getDayPlan(tasks, DAY).done.map((t) => t.id).sort()).toEqual([
      '2026-09-29T22:00:00Z',
      '2026-09-30T03:00:00Z',
      '2026-09-30T05:00:00Z',
      '2026-09-30T17:00:00Z',
    ])
    expect(getDayPlan(tasks, '2026-09-29').done.map((t) => t.id)).toEqual(['2026-09-29T05:00:00Z'])
  })
})

describe('allDayCalendarKey', () => {
  afterEach(() => setAppTimeZoneSetting(null))

  it('puts an open task on its scheduled date, then its due date', () => {
    expect(allDayCalendarKey(task('a', { scheduledDate: DAY, dueDate: '2026-10-02' }))).toBe(DAY)
    expect(allDayCalendarKey(task('b', { dueDate: '2026-10-02' }))).toBe('2026-10-02')
  })

  it('puts a completed task on the day it was completed', () => {
    setAppTimeZoneSetting('UTC')
    const done = task('c', { dueDate: '2026-10-05', completed: true, completedAt: '2026-10-01T12:00:00Z' })
    expect(allDayCalendarKey(done)).toBe('2026-10-01')
  })

  it('leaves undated tasks off the calendar even when completed', () => {
    expect(allDayCalendarKey(task('d', { completed: true, completedAt: '2026-10-01T12:00:00Z' }))).toBeNull()
  })
})
