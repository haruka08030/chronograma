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
const { buildHabitRecordIndex } = await import('./habitTiming')
const { normalizeHabitRow } = await import('./backupFormat')
const { baselineFrom, mergeSnapshots } = await import('./syncMerge')
const { countDayResult, habitPlanSlot } = await import('../../supabase/functions/_shared/dayResult.ts')
const { habitFromRow } = await import('../../supabase/functions/daily-reminders/wrapUp.ts')
const { isHabitCountedOnDate } = await import('./habitStats')
const { averageRoutineDrift, routineDriftDays } = await import('./routineDrift')
const { effectiveHabitForm, habitFromForm, EMPTY_HABIT_FORM } = await import('../components/habits/habitFormState')
const { fromDateKey } = await import('./dateKey')

const OLD = '2026-01-01T00:00:00.000Z'
const DAY = '2026-10-13'

function bath(patch: Partial<Habit> = {}): Habit {
  return {
    id: 'b',
    title: 'お風呂',
    color: '#33B679',
    timeMode: 'range',
    startTime: '21:00',
    endTime: '21:30',
    frequency: { type: 'daily' },
    createdAt: OLD,
    updatedAt: OLD,
    completedDates: [],
    archivedAt: null,
    kind: 'routine',
    ...patch,
  }
}

function log(id: string, dueDate: string, startTime: string, endTime: string, patch: Partial<Task> = {}): Task {
  return {
    ...TASK_DEFAULTS,
    id,
    title: 'お風呂',
    description: '',
    completed: true,
    completedAt: OLD,
    createdAt: OLD,
    updatedAt: OLD,
    order: 0,
    listId: '__inbox__',
    sectionId: null,
    parentId: null,
    dueDate,
    startTime,
    endTime,
    priority: 'none',
    tags: [],
    recurrence: null,
    kind: 'log',
    ...patch,
  }
}

describe('ルーティンの数え方', () => {
  it('枠は突き合わせに入れるが、予定 N 件には数えず、その時間の記録を予定外にしない', () => {
    const index = buildHabitRecordIndex([])
    const slot = habitPlanSlot(bath(), DAY, index)!
    expect(slot.source).toBe('routine')
    const record = { id: 'r', title: 'お風呂', startTime: '21:10', endTime: '21:40' }
    const result = countDayResult([slot], [record], { dateKey: DAY, todayKey: '2026-10-14', nowHm: '09:00', logMinutes: () => 30 })
    expect(result.planned).toBe(0)
    expect(result.unplannedMinutes).toBe(0)
    // 習慣のときは数える
    const habitSlot = habitPlanSlot(bath({ kind: undefined }), DAY, index)!
    expect(countDayResult([habitSlot], [], { dateKey: DAY, todayKey: '2026-10-14', nowHm: '09:00', logMinutes: () => 0 }).planned).toBe(1)
  })

  it('達成率・連続・ふりかえりの分母に入れない', () => {
    expect(isHabitCountedOnDate(bath(), fromDateKey(DAY))).toBe(false)
    expect(isHabitCountedOnDate(bath({ kind: undefined }), fromDateKey(DAY))).toBe(true)
  })
})

describe('いつもの時間からのずれ', () => {
  it('記録した日だけ、いつもの時間からの始まりのずれを新しい日から並べ、平均を出す', () => {
    const index = buildHabitRecordIndex([
      log('a', '2026-10-13', '21:30', '22:00'),
      log('b', '2026-10-12', '21:20', '21:50', { habitId: 'b', title: '風呂' }),
      log('c', '2026-10-10', '20:50', '21:20'),
    ])
    const days = routineDriftDays(bath(), index, DAY, 7)
    expect(days.map((d) => [d.dateKey, d.minutes])).toEqual([
      ['2026-10-13', 30],
      ['2026-10-12', 20],
      ['2026-10-10', -10],
    ])
    expect(averageRoutineDrift(days)).toBe(13)
    expect(averageRoutineDrift([])).toBeNull()
  })

  it('その日だけ動かした枠でも、ずれはいつもの時間から', () => {
    const routine = bath({ timeOverrides: { [DAY]: { startTime: '22:00', endTime: '22:30' } } })
    const index = buildHabitRecordIndex([log('a', DAY, '22:00', '22:30')])
    expect(routineDriftDays(routine, index, DAY, 1)[0]?.minutes).toBe(60)
  })

  it('23:30 のルーティンを次の日の 0:10 に始めた記録も、前の日のずれ（+40 分）', () => {
    const late = bath({ startTime: '23:30', endTime: '23:59' })
    const index = buildHabitRecordIndex([log('a', '2026-10-14', '00:10', '00:40')])
    expect(routineDriftDays(late, index, '2026-10-14', 2).find((d) => d.dateKey === DAY)?.minutes).toBe(40)
  })
})

describe('ルーティンのフォーム', () => {
  it('時間帯だけ・週に◯回は毎日・時間の目標なし。習慣に戻すと選んでいた値に戻る', () => {
    const form = {
      ...EMPTY_HABIT_FORM,
      title: 'お風呂',
      kind: 'routine' as const,
      timeMode: 'none' as const,
      freq: 'timesPerWeek' as const,
      goalMinutes: '30',
    }
    expect(effectiveHabitForm(form)).toMatchObject({ timeMode: 'range', freq: 'daily', goalMinutes: '' })
    expect(habitFromForm(form)).toMatchObject({ kind: 'routine', timeMode: 'range', frequency: { type: 'daily' }, goalMinutes: undefined })
    expect(habitFromForm({ ...form, kind: 'habit' })).toMatchObject({ kind: undefined, timeMode: 'none', goalMinutes: 30 })
  })
})

describe('ルーティンの保存・同期', () => {
  beforeEach(() => {
    useTaskStore.setState({ habits: [bath()], tasks: [] })
  })

  it('習慣に戻すと項目ごと消える', () => {
    useTaskStore.getState().updateHabit('b', { kind: undefined })
    expect(useTaskStore.getState().habits[0]).not.toHaveProperty('kind')
  })

  it('バックアップ・夜のまとめの行から読み、routine 以外は習慣', () => {
    expect(normalizeHabitRow(bath())?.kind).toBe('routine')
    expect(normalizeHabitRow(bath({ kind: 'x' as never }))).not.toHaveProperty('kind')
    expect(habitFromRow({ id: 'b', kind: 'routine' })?.kind).toBe('routine')
    expect(habitFromRow({ id: 'b', kind: 'habit' })).not.toHaveProperty('kind')
  })

  it('前回どの習慣もルーティンでなかったとき、手元でルーティンにしたのは、ほかの端末で後から名前を変えても残る', () => {
    const base = bath()
    delete base.kind
    const baseline = baselineFrom({ lists: [], sections: [], tasks: [], habits: [base] })
    const local = { ...base, kind: 'routine' as const, updatedAt: '2026-10-13T01:00:00.000Z' }
    const remote = { ...base, title: '夜のお風呂', updatedAt: '2026-10-13T02:00:00.000Z' }
    const { merged } = mergeSnapshots(
      { lists: [], sections: [], tasks: [], habits: [local] },
      { lists: [], sections: [], tasks: [], habits: [remote] },
      baseline,
    )
    expect(merged.habits[0]).toMatchObject({ title: '夜のお風呂', kind: 'routine' })
  })
})
