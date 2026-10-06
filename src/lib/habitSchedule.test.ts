import { describe, expect, it } from 'vitest'
import { readHabitFrequency, type Habit, type HabitFrequency } from '../types/habit'
import { habitWeekDoneCount, isHabitDueOnDate, isHabitScheduledOnDate, isHabitWeekGoalMetOnDate } from './habitSchedule'
import { habitToPlannedItem } from './habitSlots'
import { fromDateKey } from './dateKey'

const OLD = '2026-01-01T00:00:00.000Z'

function habit(frequency: HabitFrequency, completedDates: string[] = [], patch: Partial<Habit> = {}): Habit {
  return {
    id: 'h',
    title: 'ジム',
    color: '#33B679',
    timeMode: 'none',
    startTime: null,
    endTime: null,
    frequency,
    createdAt: OLD,
    updatedAt: OLD,
    completedDates,
    archivedAt: null,
    ...patch,
  }
}

// 2026-10-05 は月曜。週は 10/5（月）〜10/11（日）
const MON = '2026-10-05'
const TUE = '2026-10-06'
const WED = '2026-10-07'
const THU = '2026-10-08'
const SUN = '2026-10-11'
const NEXT_MON = '2026-10-12'

describe('週に◯回の習慣の予定', () => {
  it('曜日を決めないので、どの日にも入る', () => {
    const h = habit({ type: 'timesPerWeek', count: 3 })
    for (const key of [MON, WED, SUN]) expect(isHabitScheduledOnDate(h, fromDateKey(key))).toBe(true)
  })

  it('曜日を指定した習慣は、その曜日だけ', () => {
    const h = habit({ type: 'weekly', weekdays: [1, 3] })
    expect(isHabitScheduledOnDate(h, fromDateKey(MON))).toBe(true)
    expect(isHabitScheduledOnDate(h, fromDateKey(TUE))).toBe(false)
  })

  it('その週（月曜始まり）に達成した日を数える', () => {
    const h = habit({ type: 'timesPerWeek', count: 2 }, ['2026-10-04', MON, WED, NEXT_MON])
    expect(habitWeekDoneCount(h, fromDateKey(SUN))).toBe(2)
  })

  it('回数を満たしたら、やっていない日は「今週は達成」でやることに数えない', () => {
    const h = habit({ type: 'timesPerWeek', count: 2 }, [MON, TUE])
    expect(isHabitWeekGoalMetOnDate(h, fromDateKey(THU))).toBe(true)
    expect(isHabitDueOnDate(h, fromDateKey(THU))).toBe(false)
    // やった日はその日の結果をそのまま出す
    expect(isHabitWeekGoalMetOnDate(h, fromDateKey(MON))).toBe(false)
    expect(isHabitDueOnDate(h, fromDateKey(MON))).toBe(true)
    // 次の週はまた数え直す
    expect(isHabitDueOnDate(h, fromDateKey(NEXT_MON))).toBe(true)
  })

  it('回数に届いていなければ、どの日もやることに数える', () => {
    const h = habit({ type: 'timesPerWeek', count: 3 }, [MON, TUE])
    expect(isHabitWeekGoalMetOnDate(h, fromDateKey(THU))).toBe(false)
    expect(isHabitDueOnDate(h, fromDateKey(THU))).toBe(true)
  })

  it('アーカイブした習慣はどの日にも入らない', () => {
    const h = habit({ type: 'timesPerWeek', count: 1 }, [], { archivedAt: OLD })
    expect(isHabitDueOnDate(h, fromDateKey(MON))).toBe(false)
  })

  it('時間を決めた習慣のタイムラインの枠は、回数を満たした週のやっていない日には出さない', () => {
    const h = habit({ type: 'timesPerWeek', count: 1 }, [MON], { timeMode: 'range', startTime: '18:00', endTime: '19:00' })
    expect(habitToPlannedItem(h, MON)).not.toBeNull()
    expect(habitToPlannedItem(h, WED)).toBeNull()
    expect(habitToPlannedItem(h, NEXT_MON)).not.toBeNull()
  })
})

describe('頻度の読み込み（同期・バックアップ）', () => {
  it('週に◯回を読む。回数は 1〜6 に収める', () => {
    expect(readHabitFrequency({ type: 'timesPerWeek', count: 3 })).toEqual({ type: 'timesPerWeek', count: 3 })
    expect(readHabitFrequency({ type: 'timesPerWeek', count: 9 })).toEqual({ type: 'timesPerWeek', count: 6 })
    expect(readHabitFrequency({ type: 'timesPerWeek', count: 0 })).toEqual({ type: 'timesPerWeek', count: 1 })
  })

  it('曜日は 1〜7 の整数だけ。知らない形は毎日', () => {
    expect(readHabitFrequency({ type: 'weekly', weekdays: [1, 8, 'x', 3] })).toEqual({ type: 'weekly', weekdays: [1, 3] })
    expect(readHabitFrequency({ type: 'timesPerWeek' })).toEqual({ type: 'daily' })
    expect(readHabitFrequency({ type: 'monthly' })).toEqual({ type: 'daily' })
    expect(readHabitFrequency(null)).toEqual({ type: 'daily' })
  })
})
