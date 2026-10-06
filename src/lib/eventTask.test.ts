import { describe, expect, it } from 'vitest'
import { planKindOf, taskKindFlags, taskKindFromFlags, type Task } from '../types/task'
import { getDayPlan, getMoreSuggestions } from './dayPlan'
import { getFilteredRootTasks } from './mainListTasks'
import { computeTaskStats } from './taskStats'
import { scheduledTaskToPlannedItem } from './plannedItemUtils'
import { busySpans } from './freeSlots'
import { onboardingSteps } from './onboarding'
import { todoColorLabels, unlabeledTodoCount } from './todoColorLabels'
import { TASK_DEFAULTS } from './taskDefaults'

/**
 * 予定（`kind: 'event'`。バイト・授業など完了の丸の無いもの）の扱い。
 * To-Do の一覧・今日の計画・完了数・突き合わせには入れず、カレンダーとふさがっている時間には入れる（Google の予定と同じ）
 */

const DAY = '2026-10-06'

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

const shift = task('shift', { kind: 'event', scheduledDate: DAY, startTime: '17:00', endTime: '22:00', color: '#33B679' })
const pastClass = task('class', { kind: 'event', scheduledDate: '2026-10-05', startTime: '09:00', endTime: '10:30' })
const report = task('report', { scheduledDate: DAY, startTime: '10:00', endTime: '11:00' })
const tasks = [shift, pastClass, report]

describe('種類の印', () => {
  it('予定の印は記録の印が無いときだけ予定。書くときは予定だけに印を付ける', () => {
    expect(taskKindFromFlags(false, false, true)).toBe('event')
    expect(taskKindFromFlags(true, false, true)).toBe('log')
    expect(taskKindFromFlags(false, false)).toBe('todo')
    expect(taskKindFlags('event')).toEqual({ isTimeLog: false, isSleep: false, isEvent: true })
    expect(taskKindFlags('todo')).toEqual({ isTimeLog: false, isSleep: false, isEvent: false })
  })

  it('カレンダーの予定の欄へ動かすと、記録は To-Do に、予定は予定のまま', () => {
    expect(planKindOf(shift)).toBe('event')
    expect(planKindOf(task('log', { kind: 'log' }))).toBe('todo')
    expect(planKindOf(undefined)).toBe('todo')
  })
})

describe('予定は To-Do として数えない', () => {
  it('今日の計画: To-Do・やり残し・予定の時間に入れない', () => {
    const plan = getDayPlan(tasks, DAY)
    expect(plan.open.map((t) => t.id)).toEqual(['report'])
    expect(plan.carryOver).toEqual([])
    expect(plan.plannedMinutes).toBe(60)
    expect(getMoreSuggestions([task('later', { kind: 'event', scheduledDate: '2026-10-09' })], DAY)).toEqual([])
  })

  it('To-Do の一覧（リスト・今日・すべて）に出さない', () => {
    const input = { tasks, selectedListId: null, sortMode: 'manual' as const, filterTag: null, sections: [] }
    expect(getFilteredRootTasks({ ...input, selectedView: 'all' }).map((t) => t.id)).toEqual(['report'])
    expect(getFilteredRootTasks({ ...input, selectedView: 'today' }).map((t) => t.id)).toEqual(['report'])
    expect(getFilteredRootTasks({ ...input, selectedView: null, selectedListId: 'inbox' }).map((t) => t.id)).toEqual(['report'])
  })

  it('統計の件数・色ラベルの件数に入れない', () => {
    expect(computeTaskStats(tasks, [], DAY).totalActive).toBe(1)
    expect(todoColorLabels(tasks, new Set(), [], {})).toEqual([])
    expect(unlabeledTodoCount(tasks, new Set())).toBe(1)
  })

  it('記録との突き合わせに入れない（Google の予定と同じ）', () => {
    expect(scheduledTaskToPlannedItem(shift)).toBeNull()
    expect(scheduledTaskToPlannedItem(report)).not.toBeNull()
  })
})

describe('予定もカレンダーの予定', () => {
  it('ふさがっている時間に入る（空き時間の候補に出さない）', () => {
    expect(busySpans(tasks, [], DAY)).toEqual([
      { start: 17 * 60, end: 22 * 60 },
      { start: 10 * 60, end: 11 * 60 },
    ])
  })

  it('カレンダーに予定を入れたら、はじめの案内の「置いた」は済み（「To-Do を足した」ではない）', () => {
    expect(onboardingSteps([shift], false)).toEqual({ added: false, placed: true, recorded: false })
  })
})
