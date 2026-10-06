import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Habit, HabitFrequency } from '../types/habit'
import {
  completionRatioOnDate,
  consistencyForLast7Days,
  currentStreakDays,
  habitStreak,
  habitsStreak,
  timesPerWeekTally,
} from './habitStats'
import { fromDateKey } from './dateKey'

const OLD = '2026-01-01T00:00:00.000Z'

function habit(id: string, frequency: HabitFrequency, completedDates: string[] = []): Habit {
  return {
    id,
    title: id,
    color: '#33B679',
    timeMode: 'none',
    startTime: null,
    endTime: null,
    frequency,
    createdAt: OLD,
    updatedAt: OLD,
    completedDates,
    archivedAt: null,
  }
}

// 今日は 2026-10-14（水）。今週は 10/12（月）〜10/18（日）、先週は 10/5〜10/11、先々週は 9/28〜10/4
beforeEach(() => {
  vi.useFakeTimers({ now: new Date(2026, 9, 14, 12, 0) })
})
afterEach(() => vi.useRealTimers())

describe('連続日数', () => {
  it('毎日の習慣は今までどおり暦の日で数え、今日まだなら昨日から', () => {
    const h = habit('d', { type: 'daily' }, ['2026-10-13', '2026-10-12', '2026-10-10'])
    expect(currentStreakDays([h])).toBe(2)
    expect(habitStreak(h)).toEqual({ count: 2, unit: 'day' })
    const withToday = habit('d', { type: 'daily' }, ['2026-10-14', '2026-10-13'])
    expect(habitStreak(withToday).count).toBe(2)
  })

  it('曜日を指定した習慣は予定のある日だけで数え、予定外の日で途切れない', () => {
    // 月・水・金。10/14（水）はまだ。10/12（月）・10/9（金）・10/7（水）・10/5（月）と続き、10/2（金）は休んだ
    const h = habit('w', { type: 'weekly', weekdays: [1, 3, 5] }, ['2026-10-12', '2026-10-09', '2026-10-07', '2026-10-05'])
    expect(habitStreak(h)).toEqual({ count: 4, unit: 'day' })
    expect(currentStreakDays([h])).toBe(4)
  })

  it('曜日を指定した習慣は、予定の日にやらなかったら途切れる', () => {
    // 10/9（金）を休んだ
    const h = habit('w', { type: 'weekly', weekdays: [1, 3, 5] }, ['2026-10-12', '2026-10-07', '2026-10-05'])
    expect(habitStreak(h).count).toBe(1)
  })

  it('全体の連続も、どの習慣にも予定の無い日では途切れない', () => {
    const mon = habit('mon', { type: 'weekly', weekdays: [1] }, ['2026-10-12', '2026-10-05'])
    const sat = habit('sat', { type: 'weekly', weekdays: [6] }, ['2026-10-10'])
    expect(currentStreakDays([mon, sat])).toBe(3)
  })

  it('週に◯回は、回数を満たした週が続く数（今週まだなら先週から）', () => {
    const h = habit('g', { type: 'timesPerWeek', count: 2 }, [
      // 今週は 1 回だけ（まだ途中）
      '2026-10-13',
      // 先週 2 回
      '2026-10-06',
      '2026-10-10',
      // 先々週 3 回
      '2026-09-28',
      '2026-09-29',
      '2026-10-01',
      // その前の週は 1 回で届かない
      '2026-09-23',
    ])
    expect(habitStreak(h)).toEqual({ count: 2, unit: 'week' })
    const thisWeekToo = { ...h, completedDates: [...h.completedDates, '2026-10-14'] }
    expect(habitStreak(thisWeekToo).count).toBe(3)
  })

  it('週に◯回の習慣だけなら、要約は週で数える', () => {
    const h = habit('g', { type: 'timesPerWeek', count: 1 }, ['2026-10-06', '2026-09-30'])
    expect(habitsStreak([h])).toEqual({ count: 2, unit: 'week' })
    const d = habit('d', { type: 'daily' }, ['2026-10-13'])
    expect(habitsStreak([h, d])).toEqual({ count: 1, unit: 'day' })
  })
})

describe('達成率', () => {
  it('直近 7 日: 週に◯回は◯回のうち何回か（多くやっても◯回まで）', () => {
    const two = habit('g', { type: 'timesPerWeek', count: 3 }, ['2026-10-13', '2026-10-09'])
    expect(consistencyForLast7Days([two])).toBe(67)
    const many = habit('g', { type: 'timesPerWeek', count: 2 }, ['2026-10-13', '2026-10-12', '2026-10-11', '2026-10-09'])
    expect(consistencyForLast7Days([many])).toBe(100)
    // 7 日より前は数えない
    expect(consistencyForLast7Days([habit('g', { type: 'timesPerWeek', count: 1 }, ['2026-10-07'])])).toBe(0)
  })

  it('直近 7 日: 毎日の習慣と合わせて数える', () => {
    // 毎日: 昨日まで 6 日のうち 3 日（今日は未記録なので数えない）。週に 2 回: 2 回やった
    const d = habit('d', { type: 'daily' }, ['2026-10-13', '2026-10-12', '2026-10-11'])
    const g = habit('g', { type: 'timesPerWeek', count: 2 }, ['2026-10-13', '2026-10-10'])
    expect(consistencyForLast7Days([d, g])).toBe(Math.round((5 / 8) * 100))
  })

  it('その日の率: 週に◯回はやった日だけ数え、やらなかった日で下げない', () => {
    const d = habit('d', { type: 'daily' }, ['2026-10-13'])
    const g = habit('g', { type: 'timesPerWeek', count: 2 }, ['2026-10-13'])
    expect(completionRatioOnDate([d, g], fromDateKey('2026-10-13'))).toBe(1)
    expect(completionRatioOnDate([d, g], fromDateKey('2026-10-12'))).toBe(0)
    expect(completionRatioOnDate([d, { ...g, completedDates: [] }], fromDateKey('2026-10-13'))).toBe(1)
  })

  it('今週: 終わった週は◯回が分母、多くやっても◯回まで', () => {
    const h = habit('g', { type: 'timesPerWeek', count: 3 }, ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'])
    expect(timesPerWeekTally(h, fromDateKey('2026-10-05'), '2026-10-14')).toEqual({ expected: 3, completed: 3 })
    const one = habit('g', { type: 'timesPerWeek', count: 3 }, ['2026-10-05'])
    expect(timesPerWeekTally(one, fromDateKey('2026-10-05'), '2026-10-14')).toEqual({ expected: 3, completed: 1 })
  })

  it('今週: まだ取り返せる回数は分母に入れない', () => {
    // 水曜の時点で、残りは今日（未記録）〜日曜の 5 日。週 3 回ならまだ取り返せるので 0/0
    const none = habit('g', { type: 'timesPerWeek', count: 3 })
    expect(timesPerWeekTally(none, fromDateKey('2026-10-14'), '2026-10-14')).toEqual({ expected: 0, completed: 0 })
    const done = habit('g', { type: 'timesPerWeek', count: 3 }, ['2026-10-12'])
    expect(timesPerWeekTally(done, fromDateKey('2026-10-14'), '2026-10-14')).toEqual({ expected: 1, completed: 1 })
    // 土曜の時点で 0 回なら、残り 2 日では 6 回に届かない分（4 回）を分母に入れる
    const six = habit('g', { type: 'timesPerWeek', count: 6 })
    expect(timesPerWeekTally(six, fromDateKey('2026-10-17'), '2026-10-17')).toEqual({ expected: 4, completed: 0 })
  })
})
