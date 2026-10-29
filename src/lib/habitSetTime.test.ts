import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Habit } from '../types/habit'

beforeAll(() => {
  const mem = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  })
  vi.useFakeTimers({ toFake: ['Date'] })
  // 2026-10-26 は月曜
  vi.setSystemTime(new Date(2026, 9, 26, 12, 0))
})
afterAll(() => {
  vi.useRealTimers()
})
vi.mock('../i18n/config', () => ({
  default: { t: (k: string, o?: { returnObjects?: boolean }) => (o?.returnObjects ? [] : k), language: 'ja' },
}))

const { useTaskStore } = await import('../store/taskStore')
const { habitTimesOn } = await import('./habitTiming')

const OLD = '2026-01-01T00:00:00.000Z'
const LAST_THU = '2026-10-22'
const THU = '2026-10-29'
const FRI = '2026-10-30'
const NEXT_THU = '2026-11-05'
const THU_AFTER = '2026-11-12'
const THU_3 = '2026-11-19'

function gym(patch: Partial<Habit> = {}): Habit {
  return {
    id: 'gym',
    title: 'ジム',
    color: '#33B679',
    timeMode: 'range',
    startTime: '18:00',
    endTime: '19:00',
    frequency: { type: 'daily' },
    createdAt: OLD,
    updatedAt: OLD,
    completedDates: [],
    archivedAt: null,
    ...patch,
  }
}

const habit = () => useTaskStore.getState().habits[0]
const LATE = { startTime: '20:00', endTime: '21:00' }
const USUAL = { startTime: '18:00', endTime: '19:00' }

describe('枠のカードで時間を直す（setHabitTime）', () => {
  beforeEach(() => {
    useTaskStore.setState({ habits: [gym()], tasks: [] })
  })

  it('この日だけ: その日だけの時間になり、ほかの日は変わらない', () => {
    useTaskStore.getState().setHabitTime('gym', THU, LATE, { kind: 'day' })
    expect(habitTimesOn(habit(), THU)).toEqual(LATE)
    expect(habitTimesOn(habit(), NEXT_THU)).toEqual(USUAL)
  })

  it('これ以降の木曜（ずっと）: 毎日の習慣でもその曜日だけ変わり、前の日・ほかの曜日は変わらない', () => {
    useTaskStore.getState().setHabitTime('gym', THU, LATE, { kind: 'weekday', until: null })
    expect(habitTimesOn(habit(), THU)).toEqual(LATE)
    expect(habitTimesOn(habit(), THU_3)).toEqual(LATE)
    expect(habitTimesOn(habit(), FRI)).toEqual(USUAL)
    expect(habitTimesOn(habit(), LAST_THU)).toEqual(USUAL)
  })

  it('先の木曜から変えたら、今日〜その前の木曜は前の時間のまま', () => {
    useTaskStore.getState().setHabitTime('gym', NEXT_THU, LATE, { kind: 'weekday', until: null })
    expect(habitTimesOn(habit(), THU)).toEqual(USUAL)
    expect(habitTimesOn(habit(), NEXT_THU)).toEqual(LATE)
    expect(habitTimesOn(habit(), THU_AFTER)).toEqual(LATE)
  })

  it('これ以降の木曜は、その日から先の木曜のその日だけの時間を外す', () => {
    useTaskStore.setState({ habits: [gym({ timeOverrides: { [THU_AFTER]: { startTime: '07:00', endTime: '08:00' } } })] })
    useTaskStore.getState().setHabitTime('gym', THU, LATE, { kind: 'weekday', until: null })
    expect(habitTimesOn(habit(), THU_AFTER)).toEqual(LATE)
  })

  it('期限まで: 期限までの木曜だけ変わり、期限の後は元の時間', () => {
    useTaskStore.getState().setHabitTime('gym', THU, LATE, { kind: 'weekday', until: THU_AFTER })
    expect(habitTimesOn(habit(), THU)).toEqual(LATE)
    expect(habitTimesOn(habit(), NEXT_THU)).toEqual(LATE)
    expect(habitTimesOn(habit(), THU_AFTER)).toEqual(LATE)
    expect(habitTimesOn(habit(), THU_3)).toEqual(USUAL)
    expect(habitTimesOn(habit(), FRI)).toEqual(USUAL)
    expect(habit().weekdayTimes).toBeUndefined()
  })

  it('時刻ひとつの習慣は終わりを持たない曜日の時間になる', () => {
    useTaskStore.setState({ habits: [gym({ timeMode: 'fixed', startTime: '07:00', endTime: null })] })
    useTaskStore.getState().setHabitTime('gym', THU, { startTime: '08:00', endTime: null }, { kind: 'weekday', until: null })
    expect(habitTimesOn(habit(), THU_3)).toEqual({ startTime: '08:00', endTime: null })
    expect(habitTimesOn(habit(), FRI)).toEqual({ startTime: '07:00', endTime: null })
  })

  it('同じ時間を選び直しただけなら何も変えない', () => {
    const before = habit()
    useTaskStore.getState().setHabitTime('gym', THU, USUAL, { kind: 'day' })
    expect(habit()).toBe(before)
  })
})
