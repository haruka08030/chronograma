import { describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
import { TASK_DEFAULTS } from './taskDefaults'
import { dayPlanTally, MAX_MOVED_PLANS, movedPlansAfter, movedPlansOnDay, readMovedPlans, withMovedPlans } from './movedPlans'

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

const TODAY = '2026-10-03'

describe('movedPlansAfter', () => {
  it('今日・過ぎた日の予定を別の日へ移すと、元の日と時刻と移した先を残す', () => {
    const t = task('a', { scheduledDate: '2026-10-02', startTime: '13:00', endTime: '14:00' })
    expect(movedPlansAfter(t, '2026-10-05', TODAY)).toEqual([
      { date: '2026-10-02', startTime: '13:00', endTime: '14:00', to: '2026-10-05' },
    ])
    expect(movedPlansAfter(task('b', { scheduledDate: TODAY }), '2026-10-04', TODAY)).toEqual([
      { date: TODAY, startTime: null, endTime: null, to: '2026-10-04' },
    ])
  })

  it('先の日どうしの付け替え・予定日を外す・完了した To-Do・予定・子は残さない', () => {
    expect(movedPlansAfter(task('a', { scheduledDate: '2026-10-04' }), '2026-10-06', TODAY)).toBeUndefined()
    expect(movedPlansAfter(task('a', { scheduledDate: '2026-10-02' }), null, TODAY)).toBeUndefined()
    expect(movedPlansAfter(task('a', { scheduledDate: '2026-10-02', completed: true }), '2026-10-05', TODAY)).toBeUndefined()
    expect(movedPlansAfter(task('a', { scheduledDate: '2026-10-02', kind: 'event' }), '2026-10-05', TODAY)).toBeUndefined()
    expect(movedPlansAfter(task('a', { scheduledDate: '2026-10-02', parentId: 'p' }), '2026-10-05', TODAY)).toBeUndefined()
  })

  it('同じ日から移し直したら行き先だけ新しくし、控えのある日へ戻したらその日の控えを消す', () => {
    const once = task('a', {
      scheduledDate: '2026-10-05',
      movedPlans: movedPlansAfter(task('a', { scheduledDate: '2026-10-02' }), '2026-10-05', TODAY),
    })
    // 10/5 はまだ先の日なので、10/5 → 10/7 は控えを足さない
    expect(movedPlansAfter(once, '2026-10-07', TODAY)).toEqual([{ date: '2026-10-02', startTime: null, endTime: null, to: '2026-10-05' }])
    expect(movedPlansAfter(once, '2026-10-02', TODAY)).toEqual([])
  })

  it(`控えは ${MAX_MOVED_PLANS} 件まで（古いものから捨てる）`, () => {
    let t = task('a', { scheduledDate: '2026-01-01' })
    for (let d = 1; d <= MAX_MOVED_PLANS + 5; d++) {
      const from = `2026-0${d <= 31 ? 1 : 2}-${String(((d - 1) % 31) + 1).padStart(2, '0')}`
      const next = `2026-0${d + 1 <= 31 ? 1 : 2}-${String((d % 31) + 1).padStart(2, '0')}`
      t = { ...t, scheduledDate: from }
      t = { ...t, movedPlans: movedPlansAfter(t, next, TODAY), scheduledDate: next }
    }
    expect(t.movedPlans).toHaveLength(MAX_MOVED_PLANS)
    expect(t.movedPlans!.at(-1)!.date).toBe('2026-02-04')
  })
})

describe('readMovedPlans / withMovedPlans', () => {
  it('形の合わない控えは捨て、1 つも無ければ null。時刻は両方そろったときだけ', () => {
    expect(readMovedPlans(null)).toBeNull()
    expect(readMovedPlans([{ date: 'x', to: '2026-10-05' }, 3])).toBeNull()
    expect(readMovedPlans([{ date: '2026-10-02', to: '2026-10-05', startTime: '13:00' }])).toEqual([
      { date: '2026-10-02', startTime: null, endTime: null, to: '2026-10-05' },
    ])
  })

  it('控えが無ければ項目ごと持たない', () => {
    const t = withMovedPlans(task('a'), [{ date: '2026-10-02', startTime: null, endTime: null, to: '2026-10-05' }])
    expect('movedPlans' in t).toBe(true)
    expect('movedPlans' in withMovedPlans(t, [])).toBe(false)
    const plain = task('b')
    expect(withMovedPlans(plain, null)).toBe(plain)
  })
})

describe('dayPlanTally / movedPlansOnDay', () => {
  const moved = { date: '2026-10-02', startTime: '13:00', endTime: '14:00', to: '2026-10-05' }
  const tasks = [
    task('done', { scheduledDate: '2026-10-02', completed: true, completedAt: '2026-10-02T10:00:00Z' }),
    task('left', { scheduledDate: '2026-10-02' }),
    task('moved', { scheduledDate: '2026-10-05', movedPlans: [moved] }),
    task('trashed', { scheduledDate: '2026-10-05', movedPlans: [moved], deletedAt: '2026-10-03T00:00:00Z' }),
    task('someday', { scheduledDate: '2026-10-05', movedPlans: [moved], listId: 'someday' }),
  ]

  it('予定はその日に置いた To-Do と移した予定、できたは置いて完了したもの、持ち越しは移したもの', () => {
    expect(dayPlanTally(tasks, '2026-10-02', new Set(['someday']))).toEqual({ planned: 3, done: 1, carried: 1 })
    expect(movedPlansOnDay(tasks, '2026-10-02', new Set(['someday'])).map((m) => m.task.id)).toEqual(['moved'])
  })
})
