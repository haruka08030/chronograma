import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Habit } from '../types/habit'
import type { Task } from '../types/task'
import { TASK_DEFAULTS } from './taskDefaults'

beforeAll(() => {
  const mem = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  })
})
vi.mock('../i18n/config', () => ({
  default: { t: (k: string, o?: { returnObjects?: boolean }) => (o?.returnObjects ? [] : k), language: 'ja' },
}))

const { useTaskStore } = await import('../store/taskStore')
const { buildHabitRecordIndex, habitDayStatus, habitMinutesOn } = await import('./habitTiming')
const { normalizeHabitRow } = await import('./backupFormat')
const { readHabitGoalMinutes } = await import('../types/habit')
const { baselineFrom, mergeSnapshots } = await import('./syncMerge')

const OLD = '2026-01-01T00:00:00.000Z'
const DAY = '2026-10-13'

function vocab(patch: Partial<Habit> = {}): Habit {
  return {
    id: 'v',
    title: '英単語',
    color: '#33B679',
    timeMode: 'none',
    startTime: null,
    endTime: null,
    frequency: { type: 'daily' },
    createdAt: OLD,
    updatedAt: OLD,
    completedDates: [],
    archivedAt: null,
    goalMinutes: 30,
    ...patch,
  }
}

function log(id: string, startTime: string, endTime: string, patch: Partial<Task> = {}): Task {
  return {
    ...TASK_DEFAULTS,
    id,
    title: '英単語',
    description: '',
    completed: true,
    completedAt: OLD,
    createdAt: OLD,
    updatedAt: OLD,
    order: 0,
    listId: '__inbox__',
    sectionId: null,
    parentId: null,
    dueDate: DAY,
    startTime,
    endTime,
    priority: 'none',
    tags: [],
    recurrence: null,
    kind: 'log',
    ...patch,
  }
}

describe('時間の目標', () => {
  it('その日の記録の合計が届いたら、チェックしていなくても達成', () => {
    const tasks = [log('a', '08:00', '08:12'), log('b', '20:00', '20:20', { habitId: 'v', title: '単語' })]
    const index = buildHabitRecordIndex(tasks)
    expect(habitMinutesOn(index, vocab(), DAY)).toBe(32)
    expect(habitDayStatus(vocab(), DAY, index)).toBe('done')
  })

  it('届かない日は未達成で、何分やったかが分かる', () => {
    const index = buildHabitRecordIndex([log('a', '08:00', '08:12')])
    expect(habitMinutesOn(index, vocab(), DAY)).toBe(12)
    expect(habitDayStatus(vocab(), DAY, index)).toBe('missed')
    // 別の日・ゴミ箱の記録は数えない
    const other = buildHabitRecordIndex([
      log('x', '08:00', '09:00', { dueDate: '2026-10-12' }),
      log('y', '08:00', '09:00', { deletedAt: OLD }),
    ])
    expect(habitMinutesOn(other, vocab(), DAY)).toBe(0)
  })

  it('手でチェックした日は今までどおり達成。目標の無い習慣の動きは変わらない', () => {
    const index = buildHabitRecordIndex([log('a', '08:00', '08:12')])
    expect(habitDayStatus(vocab({ completedDates: [DAY] }), DAY, index)).toBe('done')
    expect(habitDayStatus(vocab({ goalMinutes: undefined }), DAY, index)).toBe('missed')
    expect(habitDayStatus(vocab({ goalMinutes: undefined, completedDates: [DAY] }), DAY, index)).toBe('done')
  })

  it('時間を決めた習慣は、目標の時間帯の前後の記録で数え、時刻のずれは見ない', () => {
    const gym = vocab({ title: 'ジム', timeMode: 'range', startTime: '18:00', endTime: '18:30', goalMinutes: 45 })
    const index = buildHabitRecordIndex([log('g', '18:40', '19:30', { title: 'ジム' })])
    expect(habitDayStatus(gym, DAY, index)).toBe('done')
    const short = buildHabitRecordIndex([log('g', '18:00', '18:30', { title: 'ジム' })])
    expect(habitDayStatus(gym, DAY, short)).toBe('missed')
  })

  it('チェックを外すと、時間を決めていない習慣でもその日の記録をゴミ箱へ入れる', () => {
    useTaskStore.setState({ habits: [vocab()], tasks: [log('a', '08:00', '08:40')], recentDeletes: [] })
    useTaskStore.getState().toggleHabitDate('v', DAY)
    expect(useTaskStore.getState().tasks[0].deletedAt).not.toBeNull()
    expect(habitDayStatus(useTaskStore.getState().habits[0], DAY, buildHabitRecordIndex(useTaskStore.getState().tasks))).toBe('missed')
  })
})

describe('時間の目標の編集・保存', () => {
  beforeEach(() => {
    useTaskStore.setState({ habits: [vocab()], tasks: [] })
  })

  it('外すと項目ごと消える', () => {
    useTaskStore.getState().updateHabit('v', { goalMinutes: undefined })
    expect(useTaskStore.getState().habits[0]).not.toHaveProperty('goalMinutes')
  })

  it('保存データ・バックアップから読み、1〜1440 の整数だけ', () => {
    expect(readHabitGoalMinutes(30)).toBe(30)
    for (const bad of [0, 1441, 2.5, '30', null]) expect(readHabitGoalMinutes(bad)).toBeUndefined()
    expect(normalizeHabitRow(vocab())?.goalMinutes).toBe(30)
    expect(normalizeHabitRow(vocab({ goalMinutes: undefined }))).not.toHaveProperty('goalMinutes')
  })
})

describe('時間の目標の同期', () => {
  it('前回どの習慣にも目標が無かったとき、手元で付けた目標は、ほかの端末で後から名前を変えても残る', () => {
    const base = vocab({ goalMinutes: undefined })
    delete base.goalMinutes
    const baseline = baselineFrom({ lists: [], sections: [], tasks: [], habits: [base] })
    const local = { ...base, goalMinutes: 30, updatedAt: '2026-10-13T01:00:00.000Z' }
    const remote = { ...base, title: '英単語 (アプリ)', updatedAt: '2026-10-13T02:00:00.000Z' }
    const { merged } = mergeSnapshots(
      { lists: [], sections: [], tasks: [], habits: [local] },
      { lists: [], sections: [], tasks: [], habits: [remote] },
      baseline,
    )
    expect(merged.habits[0]).toMatchObject({ title: '英単語 (アプリ)', goalMinutes: 30 })
  })
})
