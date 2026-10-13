import { describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
import { TASK_DEFAULTS } from './taskDefaults'
import { carriedDaysAfter, carriedDaysOn, mostCarriedTasks, readCarriedDays } from './carryDays'

const today = '2026-10-13'
const at = (scheduledDate: string | null, carriedDays = 0, completed = false) => ({ scheduledDate, carriedDays, completed })

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

describe('carriedDaysAfter', () => {
  it('今日 → 明日で +1、3 日前 → 今日で +3、3 日前 → 来週で +4', () => {
    expect(carriedDaysAfter(at(today), at('2026-10-14'), today)).toBe(1)
    expect(carriedDaysAfter(at('2026-10-10'), at(today), today)).toBe(3)
    expect(carriedDaysAfter(at('2026-10-10'), at('2026-10-20'), today)).toBe(4)
    expect(carriedDaysAfter(at(today, 2), at('2026-10-14'), today)).toBe(3)
  })
  it('先の日どうし・前へ戻すのは数えない', () => {
    expect(carriedDaysAfter(at('2026-10-15', 1), at('2026-10-20'), today)).toBe(1)
    expect(carriedDaysAfter(at(today, 1), at('2026-10-10'), today)).toBe(1)
  })
  it('完了・実行日を外すと 0', () => {
    expect(carriedDaysAfter(at(today, 4), at(today, 4, true), today)).toBe(0)
    expect(carriedDaysAfter(at(today, 4), at(null, 4), today)).toBe(0)
  })
})

describe('carriedDaysOn', () => {
  it('付け替えで数えた分に、前の日に置いたままの日数を足す', () => {
    expect(carriedDaysOn(at('2026-10-11', 1), today)).toBe(3)
    expect(carriedDaysOn(at(today, 2), today)).toBe(2)
    expect(carriedDaysOn(at(today, 2, true), today)).toBe(0)
  })
})

describe('mostCarriedTasks', () => {
  it('2 日以上の終わっていない To-Do を日数の多い順に 3 件。いつかのリスト・予定は入れない', () => {
    const tasks = [
      task('es', { scheduledDate: today, carriedDays: 2 }),
      task('report', { scheduledDate: '2026-10-10', carriedDays: 1 }),
      task('one', { scheduledDate: today, carriedDays: 1 }),
      task('wish', { scheduledDate: today, carriedDays: 5, listId: 'someday' }),
      task('event', { kind: 'event', scheduledDate: today, carriedDays: 5 }),
      task('a', { scheduledDate: today, carriedDays: 2 }),
      task('b', { scheduledDate: today, carriedDays: 2 }),
    ]
    expect(mostCarriedTasks(tasks, today, new Set(['someday'])).map((r) => [r.task.id, r.days])).toEqual([
      ['report', 4],
      ['a', 2],
      ['b', 2],
    ])
  })
})

describe('readCarriedDays', () => {
  it('0 以上の整数だけ', () => {
    expect(readCarriedDays(3)).toBe(3)
    expect(readCarriedDays(-1)).toBe(0)
    expect(readCarriedDays('3')).toBe(0)
    expect(readCarriedDays(undefined)).toBe(0)
  })
})
