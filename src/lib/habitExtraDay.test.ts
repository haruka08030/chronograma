import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Habit } from '../types/habit'
import type { Task } from '../types/task'

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
const { buildHabitRecordIndex, habitDayStatus } = await import('./habitTiming')
const { placeHabitAt, removeHabitExtraDay, setHabitDayTimeFromSlot } = await import('./timelineBlockEdit')
const { habitSlotId, habitToPlannedItem } = await import('./habitSlots')
const { habitPlanSlot } = await import('../../supabase/functions/_shared/dayResult.ts')
const { habitLongestStreak, habitRecentRate, isHabitCountedOnDate } = await import('./habitStats')
const { habitsMatchingTitle } = await import('./habitSuggest')
const { readHabitTimeOverrides } = await import('../types/habit')
const { fromDateKey } = await import('./dateKey')

/** 「この日もやる」日（#667） */
const MON = '2026-10-12'
const TUE = '2026-10-13'
const WED = '2026-10-14'

// ジム: 月・水 18:00〜19:00
function gym(patch: Partial<Habit> = {}): Habit {
  return {
    id: 'gym',
    title: 'ジム',
    color: '#33B679',
    timeMode: 'range',
    startTime: '18:00',
    endTime: '19:00',
    frequency: { type: 'weekly', weekdays: [1, 3] },
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    completedDates: [],
    archivedAt: null,
    ...patch,
  }
}

const get = () => useTaskStore.getState().habits[0]!
const records = () => buildHabitRecordIndex(useTaskStore.getState().tasks)
const log = (date: string, startTime: string, endTime: string): Task =>
  ({
    id: `log-${date}-${startTime}`,
    title: 'ジム',
    kind: 'log',
    dueDate: date,
    startTime,
    endTime,
    endDate: null,
    habitId: null,
    parentId: null,
    deletedAt: null,
    archivedAt: null,
  }) as unknown as Task

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 15, 12))
  useTaskStore.setState({ habits: [gym()], tasks: [] })
})
afterEach(() => vi.useRealTimers())

describe('予定の作成カードで習慣を置く', () => {
  it('決めた曜日以外の日は、その日もやる日になり、タイムラインに枠が出る', () => {
    placeHabitAt('gym', TUE, '07:00', '08:00')
    expect(get().timeOverrides?.[TUE]).toEqual({ startTime: '07:00', endTime: '08:00', extra: true })
    expect(habitToPlannedItem(get(), TUE, records())).toMatchObject({ startTime: '07:00', endTime: '08:00' })
  })

  it('決めた曜日はその日の枠を動かすのと同じ（この日もやる日にしない）', () => {
    placeHabitAt('gym', MON, '07:00', '08:00')
    expect(get().timeOverrides?.[MON]).toEqual({ startTime: '07:00', endTime: '08:00' })
  })

  it('この日もやる日の枠を動かしても、いつもの時間にしても、その日もやる日のまま', () => {
    placeHabitAt('gym', TUE, '07:00', '08:00')
    setHabitDayTimeFromSlot({ habitId: 'gym', dateKey: TUE }, '18:00', '19:00')
    expect(get().timeOverrides?.[TUE]).toEqual({ startTime: '18:00', endTime: '19:00', extra: true })
  })

  it('その日の予定から外すと枠も消える', () => {
    placeHabitAt('gym', TUE, '07:00', '08:00')
    expect(removeHabitExtraDay(habitSlotId('gym', TUE))).toBe(true)
    expect(get().timeOverrides).toBeUndefined()
    expect(habitToPlannedItem(get(), TUE, records())).toBeNull()
  })

  it('同期・バックアップで読んでも、この日もやる日の印は残る', () => {
    expect(readHabitTimeOverrides({ [TUE]: { startTime: '07:00', endTime: '08:00', extra: true } })).toEqual({
      [TUE]: { startTime: '07:00', endTime: '08:00', extra: true },
    })
  })
})

describe('この日もやる日の数え方', () => {
  beforeEach(() => placeHabitAt('gym', TUE, '07:00', '08:00'))

  it('記録があれば時刻がずれても達成（時間外にしない）', () => {
    useTaskStore.setState({ tasks: [log(TUE, '07:40', '09:00')] })
    expect(habitDayStatus(get(), TUE, records())).toBe('done')
  })

  it('「予定 N 件」にはやった日だけ入れる', () => {
    expect(habitPlanSlot(get(), TUE, records())).toBeNull()
    useTaskStore.setState({ tasks: [log(TUE, '07:00', '08:00')] })
    expect(habitPlanSlot(get(), TUE, records())).not.toBeNull()
  })

  it('やらなくても達成率の分母に入れず、連続も止めない', () => {
    useTaskStore.setState({ tasks: [log(MON, '18:00', '19:00'), log(WED, '18:00', '19:00')] })
    expect(isHabitCountedOnDate(get(), fromDateKey(TUE), records())).toBe(false)
    expect(habitRecentRate(get(), records())).toBe(habitRecentRate(gym(), records()))
    expect(habitLongestStreak(get(), records()).count).toBe(2)
  })

  it('やった日は連続に数える', () => {
    useTaskStore.setState({ tasks: [log(MON, '18:00', '19:00'), log(TUE, '07:00', '08:00'), log(WED, '18:00', '19:00')] })
    expect(habitLongestStreak(get(), records()).count).toBe(3)
  })
})

describe('習慣の名前の候補', () => {
  it('全角半角・大文字小文字を同じに数え、同じ名前 → 前が合う → 含む の順', () => {
    const habits = [gym({ id: 'a', title: 'ジムで筋トレ' }), gym({ id: 'b', title: '朝ジム' }), gym({ id: 'c', title: 'ジム' })]
    expect(habitsMatchingTitle(habits, ' ｼﾞﾑ ', TUE, records()).map((h) => h.id)).toEqual(['c', 'a', 'b'])
  })

  it('済んだ日・休みの日・アーカイブ・ルーティンは出さない', () => {
    const idx = buildHabitRecordIndex([log(MON, '18:00', '19:00')])
    expect(habitsMatchingTitle([gym()], 'ジム', MON, idx)).toEqual([])
    expect(habitsMatchingTitle([gym({ restDates: [TUE] })], 'ジム', TUE, idx)).toEqual([])
    expect(habitsMatchingTitle([gym({ archivedAt: '2026-10-02T00:00:00.000Z' })], 'ジム', TUE, idx)).toEqual([])
    expect(habitsMatchingTitle([gym({ kind: 'routine' })], 'ジム', TUE, idx)).toEqual([])
    expect(habitsMatchingTitle([gym()], '', TUE, idx)).toEqual([])
  })
})
