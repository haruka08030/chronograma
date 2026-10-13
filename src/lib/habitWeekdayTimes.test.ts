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
const { normalizeHabitRow } = await import('./backupFormat')
const { readHabitWeekdayTimes } = await import('../types/habit')

const MON = '2026-10-12'
const WED = '2026-10-14'
const SAT = '2026-10-17'

// ジム: 月・水 18:00〜19:00、土 10:00〜11:00
function gym(patch: Partial<Habit> = {}): Habit {
  return {
    id: 'gym',
    title: 'ジム',
    color: '#33B679',
    timeMode: 'range',
    startTime: '18:00',
    endTime: '19:00',
    frequency: { type: 'weekly', weekdays: [1, 3, 6] },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    completedDates: [],
    archivedAt: null,
    weekdayTimes: {
      1: { startTime: '18:00', endTime: '19:00' },
      3: { startTime: '18:00', endTime: '19:00' },
      6: { startTime: '10:00', endTime: '11:00' },
    },
    ...patch,
  }
}

describe('曜日ごとの時間', () => {
  it('その曜日の時間で判定・枠・✓ の記録を作る', () => {
    expect(habitTimesOn(gym(), MON)).toEqual({ startTime: '18:00', endTime: '19:00' })
    expect(habitTimesOn(gym(), SAT)).toEqual({ startTime: '10:00', endTime: '11:00' })
    expect(plannedRecordTimes(gym(), SAT)).toEqual({ startTime: '10:00', endTime: '11:00' })
  })

  it('その日だけの時間がさらに優先し、終わりの無い日だけの時間はその曜日の長さのまま', () => {
    const h = gym({ timeOverrides: { [SAT]: { startTime: '13:00', endTime: null } } })
    expect(habitTimesOn(h, SAT)).toEqual({ startTime: '13:00', endTime: '14:00' })
  })

  it('曜日を指定していない習慣は曜日ごとの時間を見ない', () => {
    expect(habitTimesOn(gym({ frequency: { type: 'daily' } }), SAT)).toEqual({ startTime: '18:00', endTime: '19:00' })
  })

  it('✓ で土曜の時間の記録を作り、その日は達成', () => {
    useTaskStore.setState({ habits: [gym()], tasks: [] })
    useTaskStore.getState().completeHabitAsPlanned('gym', SAT)
    const tasks = useTaskStore.getState().tasks
    expect(tasks.at(-1)).toMatchObject({ dueDate: SAT, startTime: '10:00', endTime: '11:00' })
    expect(habitDayStatus(useTaskStore.getState().habits[0], SAT, buildHabitRecordIndex(tasks))).toBe('done')
  })
})

describe('曜日ごとの時間の編集・保存', () => {
  beforeEach(() => {
    useTaskStore.setState({ habits: [gym()], tasks: [] })
  })
  const get = () => useTaskStore.getState().habits[0]

  it('土曜の枠を動かしてから土曜の時間に戻すと、その日だけの時間は消える', () => {
    useTaskStore.getState().setHabitDayTime('gym', SAT, '12:00', '13:00')
    expect(get().timeOverrides).toEqual({ [SAT]: { startTime: '12:00', endTime: '13:00' } })
    useTaskStore.getState().setHabitDayTime('gym', SAT, '10:00', '11:00')
    expect(get()).not.toHaveProperty('timeOverrides')
    // 水曜を土曜の時間にしたら、その日だけの時間になる
    useTaskStore.getState().setHabitDayTime('gym', WED, '10:00', '11:00')
    expect(get().timeOverrides).toEqual({ [WED]: { startTime: '10:00', endTime: '11:00' } })
  })

  it('曜日ごとの時間を外すと項目ごと消える', () => {
    useTaskStore.getState().updateHabit('gym', { weekdayTimes: undefined })
    expect(get()).not.toHaveProperty('weekdayTimes')
    expect(get().updatedAt).not.toBe('2026-01-01T00:00:00.000Z')
  })

  it('保存データ・バックアップから読み、読めない曜日は捨てる', () => {
    expect(
      readHabitWeekdayTimes({ '6': { startTime: '10:00', endTime: '11:00' }, '8': { startTime: '10:00' }, '1': { startTime: 'x' } }),
    ).toEqual({
      6: { startTime: '10:00', endTime: '11:00' },
    })
    expect(readHabitWeekdayTimes({})).toBeUndefined()
    expect(normalizeHabitRow(gym())?.weekdayTimes).toEqual(gym().weekdayTimes)
    expect(normalizeHabitRow(gym({ weekdayTimes: undefined }))).not.toHaveProperty('weekdayTimes')
    expect(habitTimesOn(gym(), MON)).toEqual({ startTime: '18:00', endTime: '19:00' })
  })
})
