import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Habit } from '../types/habit'

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
const { buildHabitRecordIndex, habitDayStatus, habitTimesOn, plannedRecordTimes } = await import('./habitTiming')
const { habitSlotId, habitToPlannedItem, parseHabitSlotId } = await import('./habitSlots')
const { normalizeHabitRow } = await import('./backupFormat')
const { readHabitTimeOverrides } = await import('../types/habit')

const OLD = '2026-01-01T00:00:00.000Z'
const DAY = '2026-10-08'
const OTHER = '2026-10-09'

function gym(patch: Partial<Habit> = {}): Habit {
  return {
    id: 'gym',
    title: 'ジム',
    color: '#33B679',
    timeMode: 'range',
    startTime: '18:00',
    endTime: '19:30',
    frequency: { type: 'daily' },
    createdAt: OLD,
    updatedAt: OLD,
    completedDates: [],
    archivedAt: null,
    ...patch,
  }
}

describe('その日だけの時間（habitTimesOn）', () => {
  it('その日だけの時間がある日はそれ、ほかの日は習慣の時間', () => {
    const h = gym({ timeOverrides: { [DAY]: { startTime: '20:00', endTime: '21:00' } } })
    expect(habitTimesOn(h, DAY)).toEqual({ startTime: '20:00', endTime: '21:00' })
    expect(habitTimesOn(h, OTHER)).toEqual({ startTime: '18:00', endTime: '19:30' })
  })

  it('範囲の習慣で、その日の時間に終わりが無ければ、習慣の長さのまま開始をずらす（日をまたいでも）', () => {
    expect(habitTimesOn(gym({ timeOverrides: { [DAY]: { startTime: '19:00', endTime: null } } }), DAY)).toEqual({
      startTime: '19:00',
      endTime: '20:30',
    })
    expect(habitTimesOn(gym({ timeOverrides: { [DAY]: { startTime: '23:00', endTime: null } } }), DAY)?.endTime).toBe('00:30')
  })

  it('時刻ひとつの習慣は開始だけを使い、時間を決めていない習慣は null', () => {
    const fixed = gym({ timeMode: 'fixed', endTime: null, timeOverrides: { [DAY]: { startTime: '07:00', endTime: '08:00' } } })
    expect(habitTimesOn(fixed, DAY)).toEqual({ startTime: '07:00', endTime: null })
    expect(plannedRecordTimes(fixed, DAY)).toEqual({ startTime: '07:00', endTime: '07:15' })
    expect(habitTimesOn(gym({ timeMode: 'none', startTime: null, endTime: null }), DAY)).toBeNull()
  })

  it('タイムラインの枠はその日の時間で出て、枠の id から習慣と日を取り出せる', () => {
    const h = gym({ timeOverrides: { [DAY]: { startTime: '20:00', endTime: '21:00' } } })
    expect(habitToPlannedItem(h, DAY)).toMatchObject({ id: habitSlotId('gym', DAY), startTime: '20:00', endTime: '21:00' })
    expect(habitToPlannedItem(h, OTHER)).toMatchObject({ startTime: '18:00', endTime: '19:30' })
    expect(parseHabitSlotId(habitSlotId('gym', DAY))).toEqual({ habitId: 'gym', dateKey: DAY })
    expect(parseHabitSlotId('event-x')).toBeNull()
  })
})

describe('setHabitDayTime', () => {
  beforeEach(() => {
    useTaskStore.setState({ habits: [gym()], tasks: [] })
  })
  const get = () => useTaskStore.getState().habits[0]

  it('その日だけ時間を変え、習慣の時間・ほかの日は変えない。取り消せる', () => {
    useTaskStore.getState().setHabitDayTime('gym', DAY, '20:00', '21:30', { key: 'undo.habitDayTime' })
    expect(get()).toMatchObject({
      startTime: '18:00',
      endTime: '19:30',
      timeOverrides: { [DAY]: { startTime: '20:00', endTime: '21:30' } },
    })
    expect(get().updatedAt).not.toBe(OLD)
    expect(useTaskStore.getState().undoBanner?.text).toMatchObject({ key: 'undo.habitDayTime' })
    useTaskStore.getState().undoLastOperation()
    expect(get()).not.toHaveProperty('timeOverrides')
  })

  it('習慣の時間に戻したら、その日の分を消し、1 日も無ければ項目ごと外す', () => {
    useTaskStore.getState().setHabitDayTime('gym', DAY, '20:00', '21:30')
    useTaskStore.getState().setHabitDayTime('gym', OTHER, '07:00', '08:30')
    useTaskStore.getState().setHabitDayTime('gym', DAY, '18:00', '19:30')
    expect(get().timeOverrides).toEqual({ [OTHER]: { startTime: '07:00', endTime: '08:30' } })
    useTaskStore.getState().setHabitDayTime('gym', OTHER, '18:00', '19:30')
    expect(get()).not.toHaveProperty('timeOverrides')
  })

  it('同じ時間なら何もしない（取り消しの履歴を積まない）。時刻ひとつの習慣は終わりを見ない', () => {
    useTaskStore.getState().setHabitDayTime('gym', DAY, '18:00', '19:30')
    expect(get().updatedAt).toBe(OLD)
    useTaskStore.setState({ habits: [gym({ timeMode: 'fixed', endTime: null })] })
    useTaskStore.getState().setHabitDayTime('gym', DAY, '07:00', '07:15')
    expect(get().timeOverrides).toEqual({ [DAY]: { startTime: '07:00', endTime: null } })
    useTaskStore.getState().setHabitDayTime('gym', DAY, '18:00', '18:15')
    expect(get()).not.toHaveProperty('timeOverrides')
  })

  it('✓ で作る記録はその日の時間になり、その時間で達成になる', () => {
    useTaskStore.getState().setHabitDayTime('gym', DAY, '20:00', '21:30')
    useTaskStore.getState().toggleHabitDate('gym', DAY)
    const { tasks, habits } = useTaskStore.getState()
    expect(tasks.find((t) => t.habitId === 'gym')).toMatchObject({ dueDate: DAY, startTime: '20:00', endTime: '21:30' })
    expect(habitDayStatus(habits[0], DAY, buildHabitRecordIndex(tasks))).toBe('done')
  })

  it('習慣の時間どおりにやった記録は、その日の時間を動かした日は時間外になる', () => {
    useTaskStore.getState().toggleHabitDate('gym', DAY)
    useTaskStore.getState().setHabitDayTime('gym', DAY, '20:00', '21:30')
    const { tasks, habits } = useTaskStore.getState()
    expect(habitDayStatus(habits[0], DAY, buildHabitRecordIndex(tasks))).toBe('offTime')
  })
})

describe('読み込み', () => {
  it('読めない日・時刻は捨て、1 日も残らなければ undefined', () => {
    expect(
      readHabitTimeOverrides({ [DAY]: { startTime: '20:00', endTime: 'x' }, '10/09': { startTime: '20:00' }, [OTHER]: { startTime: 9 } }),
    ).toEqual({ [DAY]: { startTime: '20:00', endTime: null } })
    expect(readHabitTimeOverrides({})).toBeUndefined()
    expect(readHabitTimeOverrides([])).toBeUndefined()
  })

  it('バックアップの習慣はその日だけの時間を持ち、無いバックアップでは項目が無い', () => {
    const withDay = normalizeHabitRow({ ...gym(), timeOverrides: { [DAY]: { startTime: '20:00', endTime: '21:00' } } })
    expect(withDay?.timeOverrides).toEqual({ [DAY]: { startTime: '20:00', endTime: '21:00' } })
    expect(normalizeHabitRow(gym())).not.toHaveProperty('timeOverrides')
  })
})
