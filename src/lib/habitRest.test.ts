import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Habit, HabitFrequency } from '../types/habit'

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
const { habitRestRunEnd, isHabitDueOnDate, isHabitScheduledOnDate, habitWeekRequired } = await import('./habitSchedule')
const { habitLongestStreak, habitRecentRate, habitStreak, isHabitCountedOnDate, timesPerWeekTally } = await import('./habitStats')
const { getReview } = await import('./weekReview')
const { normalizeHabitRow } = await import('./backupFormat')
const { baselineFrom, mergeSnapshots } = await import('./syncMerge')
const { readHabitRestDates } = await import('../types/habit')
const { fromDateKey } = await import('./dateKey')

const OLD = '2026-01-01T00:00:00.000Z'

function habit(frequency: HabitFrequency, completedDates: string[] = [], restDates?: string[]): Habit {
  return {
    id: 'h',
    title: '英単語',
    color: '#33B679',
    timeMode: 'none',
    startTime: null,
    endTime: null,
    frequency,
    createdAt: OLD,
    updatedAt: OLD,
    completedDates,
    archivedAt: null,
    ...(restDates ? { restDates } : {}),
  }
}

// 今日は 2026-10-14（水）。今週は 10/12（月）〜10/18（日）、先週は 10/5〜10/11
beforeEach(() => {
  vi.useFakeTimers({ now: new Date(2026, 9, 14, 12, 0) })
})
afterEach(() => vi.useRealTimers())

describe('休みの日は予定の日に数えない', () => {
  it('どの頻度でも、休みの日は予定・やること・分母に入らない', () => {
    for (const f of [{ type: 'daily' }, { type: 'weekly', weekdays: [2] }, { type: 'timesPerWeek', count: 3 }] as HabitFrequency[]) {
      const h = habit(f, [], ['2026-10-13'])
      const tue = fromDateKey('2026-10-13')
      expect(isHabitScheduledOnDate(h, tue)).toBe(false)
      expect(isHabitDueOnDate(h, tue)).toBe(false)
      expect(isHabitCountedOnDate(h, tue)).toBe(false)
    }
  })

  it('毎日の習慣は、休みの日をはさんでも連続が止まらず、休みの日は数えない', () => {
    // 10/10・10/11 は休み、10/9・10/12・10/13 はやった
    const h = habit({ type: 'daily' }, ['2026-10-09', '2026-10-12', '2026-10-13'], ['2026-10-10', '2026-10-11'])
    expect(habitStreak(h)).toEqual({ count: 3, unit: 'day' })
    expect(habitLongestStreak(h)).toEqual({ count: 3, unit: 'day' })
    // 休みの日にやっていても数えない
    const doneOnRest = habit({ type: 'daily' }, ['2026-10-11', '2026-10-12', '2026-10-13'], ['2026-10-11'])
    expect(habitStreak(doneOnRest).count).toBe(2)
  })

  it('連続が途切れても最長は残る', () => {
    const h = habit({ type: 'daily' }, ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'])
    expect(habitStreak(h).count).toBe(0)
    expect(habitLongestStreak(h).count).toBe(4)
  })

  it('直近の達成率の分母から休みの日を外す', () => {
    // 先週と今週（今日の手前まで）9 日のうち 4 日休み、残り 5 日を全部やった
    const done = ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-12', '2026-10-13']
    const rest = ['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-05']
    const h = { ...habit({ type: 'daily' }, done, rest), createdAt: '2026-10-05T12:00:00.000Z' }
    expect(habitRecentRate(h)).toBe(100)
    expect(habitRecentRate({ ...h, restDates: undefined })).toBe(56)
  })

  it('週のふりかえりの習慣の達成も、休みの日を分母に入れない', () => {
    const h = habit({ type: 'daily' }, ['2026-10-05', '2026-10-06'], ['2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'])
    const now = new Date(2026, 9, 14, 12, 0)
    expect(getReview([], [h], 'week', new Date(2026, 9, 7), new Set(), now).habitRate).toBe(1)
    expect(getReview([], [{ ...h, restDates: undefined }], 'week', new Date(2026, 9, 7), new Set(), now).habitRate).toBeCloseTo(2 / 7)
  })

  it('週に◯回は、休みを除いた日数より多くは求めず、まるごと休みの週は連続を止めない', () => {
    const lastWeek = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']
    // 先週はまるごと休み、先々週は 3 回やった
    const h = habit({ type: 'timesPerWeek', count: 3 }, ['2026-09-28', '2026-09-30', '2026-10-02'], lastWeek)
    expect(habitWeekRequired(h, fromDateKey('2026-10-07'))).toBe(0)
    expect(habitStreak(h)).toEqual({ count: 1, unit: 'week' })
    expect(timesPerWeekTally(h, fromDateKey('2026-10-07'), '2026-10-14')).toEqual({ expected: 0, completed: 0 })
    // 5 日休んだ週は 2 回で満たす
    const partly = habit({ type: 'timesPerWeek', count: 3 }, ['2026-10-05', '2026-10-06'], lastWeek.slice(2))
    expect(habitWeekRequired(partly, fromDateKey('2026-10-07'))).toBe(2)
    expect(habitStreak(partly)).toEqual({ count: 1, unit: 'week' })
  })
})

describe('setHabitRest', () => {
  beforeEach(() => {
    useTaskStore.setState({ habits: [habit({ type: 'daily' })], tasks: [] })
  })
  const get = () => useTaskStore.getState().habits[0]

  it('その日・期間を休みにし、外せて、取り消せる。1 日も無くなったら項目ごと外す', () => {
    useTaskStore.getState().setHabitRest('h', '2026-10-15', '2026-10-15', true)
    expect(get().restDates).toEqual(['2026-10-15'])
    expect(useTaskStore.getState().undoBanner?.text).toMatchObject({ key: 'undo.habitRest' })
    useTaskStore.getState().setHabitRest('h', '2026-10-20', '2026-10-22', true)
    expect(get().restDates).toEqual(['2026-10-15', '2026-10-20', '2026-10-21', '2026-10-22'])
    useTaskStore.getState().undoLastOperation()
    expect(get().restDates).toEqual(['2026-10-15'])
    useTaskStore.getState().setHabitRest('h', '2026-10-15', '2026-10-15', false)
    expect(get()).not.toHaveProperty('restDates')
    expect(get().updatedAt).not.toBe(OLD)
  })

  it('「休みを外す」はその日から先の続きだけ（前の日の休みは残す）', () => {
    const h = habit({ type: 'daily' }, [], ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-20'])
    expect(habitRestRunEnd(h, '2026-10-14')).toBe('2026-10-15')
    useTaskStore.setState({ habits: [h] })
    useTaskStore.getState().setHabitRest('h', '2026-10-14', habitRestRunEnd(h, '2026-10-14'), false)
    expect(get().restDates).toEqual(['2026-10-12', '2026-10-13', '2026-10-20'])
  })
})

describe('休みの日の保存・同期', () => {
  it('バックアップ・保存データから読み、読めない日は捨てる', () => {
    expect(readHabitRestDates(['2026-10-14', 'x', '2026-10-13', '2026-10-13'])).toEqual(['2026-10-13', '2026-10-14'])
    expect(readHabitRestDates([])).toBeUndefined()
    expect(readHabitRestDates('2026-10-13')).toBeUndefined()
    expect(normalizeHabitRow({ ...habit({ type: 'daily' }), restDates: ['2026-10-13'] })?.restDates).toEqual(['2026-10-13'])
    expect(normalizeHabitRow(habit({ type: 'daily' }))).not.toHaveProperty('restDates')
  })

  it('2 台で別々に休みを付けたら両方残り、片方で外した日は外れる', () => {
    const base = habit({ type: 'daily' }, [], ['2026-10-01'])
    const baseline = baselineFrom({ lists: [], sections: [], tasks: [], habits: [base] })
    const local = { ...base, restDates: ['2026-10-20'], updatedAt: '2026-10-14T01:00:00.000Z' }
    const remote = { ...base, restDates: ['2026-10-01', '2026-10-25'], updatedAt: '2026-10-14T02:00:00.000Z' }
    const { merged } = mergeSnapshots(
      { lists: [], sections: [], tasks: [], habits: [local] },
      { lists: [], sections: [], tasks: [], habits: [remote] },
      baseline,
    )
    expect(merged.habits[0].restDates).toEqual(['2026-10-20', '2026-10-25'])
  })
})
