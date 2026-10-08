import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Habit, HabitFrequency } from '../types/habit'
import { currentStreakDays, habitLongestStreak, habitRecentRate, habitStreak, timesPerWeekTally } from './habitStats'
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
})

describe('達成率', () => {
  it('直近 4 週: 毎日の習慣は 28 日で数え、今日の未記録は数えない', () => {
    // 今日（10/14）は未記録なので 27 日のうち 3 日
    const d = habit('d', { type: 'daily' }, ['2026-10-13', '2026-10-12', '2026-10-11'])
    expect(habitRecentRate(d)).toBe(Math.round((3 / 27) * 100))
    expect(habitRecentRate({ ...d, completedDates: ['2026-10-14', ...d.completedDates] })).toBe(Math.round((4 / 28) * 100))
  })

  it('直近 4 週: 週に◯回は週ごとに◯回のうち何回か（多くやっても◯回まで）', () => {
    // 今週は 1 回で、まだ取り返せるので 1/1。先週 3 回（2 まで）、先々週 0、その前 1 → (1+2+0+1)/(1+2+2+2)
    const g = habit('g', { type: 'timesPerWeek', count: 2 }, ['2026-10-13', '2026-10-05', '2026-10-06', '2026-10-07', '2026-09-22'])
    expect(habitRecentRate(g)).toBe(Math.round((4 / 7) * 100))
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

describe('作る前の日は数えない', () => {
  const TODAY_MORNING = new Date(2026, 9, 14, 8, 0).toISOString()
  const created = (h: Habit): Habit => ({ ...h, createdAt: TODAY_MORNING })

  it('毎日の習慣を今日作って今日だけ達成 → 直近 4 週は 100%', () => {
    const h = created(habit('d', { type: 'daily' }, ['2026-10-14']))
    expect(habitRecentRate(h)).toBe(100)
    // 今日まだなら数える日が無い
    expect(habitRecentRate({ ...h, completedDates: [] })).toBeNull()
  })

  it('作る前の日でも達成を付けていれば（取り込みなど）その日は数える', () => {
    const h = created(habit('d', { type: 'daily' }, ['2026-10-14', '2026-10-12']))
    expect(habitRecentRate(h)).toBe(100)
  })

  it('週に◯回: 作った週より前の週は数えない', () => {
    const g = created(habit('g', { type: 'timesPerWeek', count: 2 }, ['2026-10-14']))
    expect(habitRecentRate(g)).toBe(100)
  })
})

describe('最長の連続', () => {
  it('毎日: 途切れる前のいちばん長い連続（今の連続も含む）', () => {
    const h = habit('d', { type: 'daily' }, ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-12', '2026-10-13'])
    expect(habitLongestStreak(h)).toEqual({ count: 4, unit: 'day' })
    expect(habitStreak(h)).toEqual({ count: 2, unit: 'day' })
  })

  it('曜日指定: 予定の無い日では途切れない', () => {
    // 月・水・金。10/5, 7, 9, 12 と続く（10/14 の今日はまだ）
    const h = habit('w', { type: 'weekly', weekdays: [1, 3, 5] }, ['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12'])
    expect(habitLongestStreak(h)).toEqual({ count: 4, unit: 'day' })
  })

  it('週に◯回: 回数を満たした週の続き。今週の途中では途切れない', () => {
    const g = habit('g', { type: 'timesPerWeek', count: 1 }, ['2026-09-15', '2026-09-22', '2026-10-06'])
    expect(habitLongestStreak(g)).toEqual({ count: 2, unit: 'week' })
  })
})
