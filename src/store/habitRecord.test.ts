import { describe, expect, it } from 'vitest'
import type { Habit } from '../types/habit'
import type { Task } from '../types/task'
import { assignColorsInOrder, categoryHex } from '../lib/logCategoryColors'
import { completeHabitAsPlannedPatch, uncheckHabitDatePatch } from './habitRecord'
import { TASK_DEFAULTS } from '../lib/taskDefaults'

// localStorage・i18n を用意しなくても読める（色の名前と「今」は引数で渡す）

const NOW = '2026-10-02T12:00:00.000Z'
const env = { now: NOW, colorNames: new Set<string>() }
const presets = ['運動', '勉強']
const colors = assignColorsInOrder(presets)

function habit(fields: Partial<Habit> = {}): Habit {
  return {
    id: 'h1',
    title: '朝ラン',
    color: '#123456',
    timeMode: 'range',
    startTime: '06:00',
    endTime: '06:30',
    frequency: { type: 'daily' },
    createdAt: NOW,
    updatedAt: NOW,
    completedDates: [],
    archivedAt: null,
    ...fields,
  }
}

function record(fields: Partial<Task> = {}): Task {
  return {
    ...TASK_DEFAULTS,
    id: 'r1',
    title: '朝ラン',
    description: '',
    completed: true,
    completedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    order: 5,
    listId: '__inbox__',
    sectionId: null,
    parentId: null,
    dueDate: '2026-10-02',
    startTime: '06:00',
    endTime: '06:30',
    priority: 'none',
    tags: [],
    recurrence: null,
    kind: 'log',
    ...fields,
  }
}

const state = (h: Habit, tasks: Task[] = []) => ({
  habits: [h],
  tasks,
  recentDeletes: [],
  timeLogTagPresets: presets,
  logCategoryColors: colors,
})

describe('completeHabitAsPlannedPatch（習慣の記録化）', () => {
  it('時間を決めた習慣は、達成にして予定どおりの時刻の記録を作る', () => {
    const patch = completeHabitAsPlannedPatch(state(habit()), 'h1', '2026-10-02', env)!
    expect(patch.habits[0]!.completedDates).toEqual(['2026-10-02'])
    expect(patch.habits[0]!.updatedAt).toBe(NOW)
    const tasks = 'tasks' in patch ? patch.tasks : []
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({
      title: '朝ラン',
      listId: '__inbox__',
      dueDate: '2026-10-02',
      startTime: '06:00',
      endTime: '06:30',
      kind: 'log',
      completed: true,
      completedAt: NOW,
      createdAt: NOW,
      habitId: 'h1',
      order: 1,
      // ラベルの色でなければ、習慣の色を名前の無い色として残す
      tags: [],
      color: '#123456',
    })
  })

  it('時刻ひとつの習慣は 15 分の記録にする', () => {
    const patch = completeHabitAsPlannedPatch(
      state(habit({ timeMode: 'fixed', endTime: null, startTime: '21:50' })),
      'h1',
      '2026-10-02',
      env,
    )!
    const tasks = 'tasks' in patch ? patch.tasks : []
    expect(tasks[0]).toMatchObject({ startTime: '21:50', endTime: '22:05' })
  })

  it('習慣の色がラベルの色なら、そのラベルの記録になる', () => {
    const h = habit({ color: categoryHex('運動', colors) })
    const patch = completeHabitAsPlannedPatch(state(h), 'h1', '2026-10-02', env)!
    const tasks = 'tasks' in patch ? patch.tasks : []
    expect(tasks[0]).toMatchObject({ tags: ['運動'], color: null })
  })

  it('習慣の色＝ラベル。同じ名前の過去の記録のラベルより習慣の色を優先する', () => {
    const past = record({ id: 'old', dueDate: '2026-09-30', tags: ['勉強'] })
    const named = completeHabitAsPlannedPatch(state(habit({ color: categoryHex('運動', colors) }), [past]), 'h1', '2026-10-02', env)!
    expect(('tasks' in named ? named.tasks : []).at(-1)).toMatchObject({ tags: ['運動'], color: null })
    // 名前の無い色でも推定せず、色のまま残す
    const unnamed = completeHabitAsPlannedPatch(state(habit(), [past]), 'h1', '2026-10-02', env)!
    expect(('tasks' in unnamed ? unnamed.tasks : []).at(-1)).toMatchObject({ tags: [], color: '#123456' })
  })

  it('同じ名前の記録が既にあれば、達成だけにして記録は作らない', () => {
    const patch = completeHabitAsPlannedPatch(state(habit(), [record()]), 'h1', '2026-10-02', env)!
    expect(patch.habits[0]!.completedDates).toEqual(['2026-10-02'])
    expect('tasks' in patch).toBe(false)
  })

  it('時間を決めていない習慣は達成だけ', () => {
    const patch = completeHabitAsPlannedPatch(state(habit({ timeMode: 'none', startTime: null, endTime: null })), 'h1', '2026-10-02', env)!
    expect('tasks' in patch).toBe(false)
    expect(patch.habits[0]!.completedDates).toEqual(['2026-10-02'])
  })

  it('達成済みで記録もあれば何もしない（null）。無い習慣も null', () => {
    const done = habit({ completedDates: ['2026-10-02'] })
    expect(completeHabitAsPlannedPatch(state(done, [record()]), 'h1', '2026-10-02', env)).toBeNull()
    expect(completeHabitAsPlannedPatch(state(habit()), 'nope', '2026-10-02', env)).toBeNull()
  })

  it('達成済みでも記録が無ければ記録だけ足す（達成日は増やさない）', () => {
    const done = habit({ completedDates: ['2026-10-02'] })
    const s = state(done)
    const patch = completeHabitAsPlannedPatch(s, 'h1', '2026-10-02', env)!
    expect(patch.habits).toBe(s.habits)
    expect('tasks' in patch && patch.tasks).toHaveLength(1)
  })
})

describe('uncheckHabitDatePatch', () => {
  it('達成を外し、その日の記録をゴミ箱へ入れる', () => {
    const h = habit({ completedDates: ['2026-10-01', '2026-10-02'] })
    const other = record({ id: 'r2', title: '読書', startTime: '20:00', endTime: '21:00' })
    const patch = uncheckHabitDatePatch(state(h, [record({ habitId: 'h1' }), other]), 'h1', '2026-10-02', { now: NOW, deletedAt: 42 })!
    expect(patch.habits[0]!.completedDates).toEqual(['2026-10-01'])
    expect(patch.tasks.find((t) => t.id === 'r1')!.deletedAt).toBe(NOW)
    expect(patch.tasks.find((t) => t.id === 'r2')!.deletedAt).toBeNull()
    expect(patch.recentDeletes).toEqual([{ ids: ['r1'], at: 42 }])
  })
})
