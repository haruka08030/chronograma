import { describe, expect, it } from 'vitest'
import type { Habit } from '../../types/habit'
import { canSubmitHabitForm, EMPTY_HABIT_FORM, habitFormFrom, habitFromForm, type HabitFormState } from './habitFormState'

const OLD = '2026-01-01T00:00:00.000Z'

function habit(patch: Partial<Habit>): Habit {
  return {
    id: 'h',
    title: 'ジム',
    color: '#33B679',
    timeMode: 'none',
    startTime: null,
    endTime: null,
    frequency: { type: 'daily' },
    createdAt: OLD,
    updatedAt: OLD,
    completedDates: [],
    archivedAt: null,
    ...patch,
  }
}

const form = (patch: Partial<HabitFormState>): HabitFormState => ({ ...EMPTY_HABIT_FORM, title: 'ジム', timeMode: 'none', ...patch })

describe('習慣のフォームの頻度', () => {
  it('週に◯回を選ぶと、回数を持った頻度になる', () => {
    expect(habitFromForm(form({ freq: 'timesPerWeek', timesPerWeek: 3 })).frequency).toEqual({ type: 'timesPerWeek', count: 3 })
  })

  it('選んでいない頻度の曜日・回数は使わない', () => {
    expect(habitFromForm(form({ freq: 'daily', timesPerWeek: 4 })).frequency).toEqual({ type: 'daily' })
    expect(habitFromForm(form({ freq: 'weekly', weekdays: [2, 4], timesPerWeek: 4 })).frequency).toEqual({
      type: 'weekly',
      weekdays: [2, 4],
    })
  })

  it('回数は 1〜6 の整数だけ送れる', () => {
    expect(canSubmitHabitForm(form({ freq: 'timesPerWeek', timesPerWeek: 1 }))).toBe(true)
    expect(canSubmitHabitForm(form({ freq: 'timesPerWeek', timesPerWeek: 6 }))).toBe(true)
    expect(canSubmitHabitForm(form({ freq: 'timesPerWeek', timesPerWeek: 0 }))).toBe(false)
    expect(canSubmitHabitForm(form({ freq: 'timesPerWeek', timesPerWeek: 7 }))).toBe(false)
    // 毎日のときは回数を見ない
    expect(canSubmitHabitForm(form({ freq: 'daily', timesPerWeek: 0 }))).toBe(true)
  })

  it('編集を始めると今の回数が入り、曜日は初期値のまま', () => {
    const f = habitFormFrom(habit({ frequency: { type: 'timesPerWeek', count: 4 } }))
    expect(f.freq).toBe('timesPerWeek')
    expect(f.timesPerWeek).toBe(4)
    expect(f.weekdays).toEqual(EMPTY_HABIT_FORM.weekdays)
  })

  it('曜日を指定した習慣を編集すると、回数は初期値', () => {
    const f = habitFormFrom(habit({ frequency: { type: 'weekly', weekdays: [5, 1] } }))
    expect(f.weekdays).toEqual([1, 5])
    expect(f.timesPerWeek).toBe(EMPTY_HABIT_FORM.timesPerWeek)
  })
})

describe('曜日ごとの時間', () => {
  const gym = form({ freq: 'weekly', weekdays: [1, 3, 6], timeMode: 'range', startTime: '18:00', endTime: '19:00' })

  it('押さなければ今までどおり 1 つの時間で、曜日ごとの時間は外す', () => {
    expect(habitFromForm(gym)).toMatchObject({ startTime: '18:00', endTime: '19:00', weekdayTimes: undefined })
  })

  it('押すと選んだ曜日ごとの時間になり、まだ入れていない曜日は上の時間。習慣の時間は最初の曜日', () => {
    const f = {
      ...gym,
      perWeekday: true,
      weekdayTimes: { 6: { startTime: '10:00', endTime: '11:00' }, 1: { startTime: '17:00', endTime: '18:30' } },
    }
    expect(habitFromForm(f)).toMatchObject({
      startTime: '17:00',
      endTime: '18:30',
      weekdayTimes: {
        1: { startTime: '17:00', endTime: '18:30' },
        3: { startTime: '18:00', endTime: '19:00' },
        6: { startTime: '10:00', endTime: '11:00' },
      },
    })
    expect(canSubmitHabitForm(f)).toBe(true)
    expect(canSubmitHabitForm({ ...f, weekdayTimes: { ...f.weekdayTimes, 6: { startTime: '10:00', endTime: '10:00' } } })).toBe(false)
  })

  it('時刻ひとつの習慣は終わりを持たず、毎日・時間なしにしたら曜日ごとの時間を外す', () => {
    const fixed = { ...gym, timeMode: 'fixed' as const, perWeekday: true, weekdayTimes: { 6: { startTime: '10:00', endTime: '11:00' } } }
    expect(habitFromForm(fixed).weekdayTimes).toEqual({
      1: { startTime: '18:00', endTime: null },
      3: { startTime: '18:00', endTime: null },
      6: { startTime: '10:00', endTime: null },
    })
    expect(habitFromForm({ ...fixed, freq: 'daily' }).weekdayTimes).toBeUndefined()
    expect(habitFromForm({ ...fixed, timeMode: 'none' }).weekdayTimes).toBeUndefined()
  })

  it('編集を始めると、曜日ごとの時間の欄が開いた状態から', () => {
    const h = habit({
      frequency: { type: 'weekly', weekdays: [1, 6] },
      timeMode: 'range',
      startTime: '18:00',
      endTime: '19:00',
      weekdayTimes: { 1: { startTime: '18:00', endTime: '19:00' }, 6: { startTime: '10:00', endTime: '11:00' } },
    })
    const f = habitFormFrom(h)
    expect(f.perWeekday).toBe(true)
    expect(habitFromForm(f).weekdayTimes).toEqual(h.weekdayTimes)
  })
})

describe('時間の目標', () => {
  it('空なら目標なし、1〜1440 の整数なら目標、それ以外は送れない', () => {
    expect(habitFromForm(form({})).goalMinutes).toBeUndefined()
    expect(habitFromForm(form({ goalMinutes: '30' })).goalMinutes).toBe(30)
    expect(canSubmitHabitForm(form({ goalMinutes: '30' }))).toBe(true)
    for (const bad of ['0', '1441', '2.5', 'x']) expect(canSubmitHabitForm(form({ goalMinutes: bad }))).toBe(false)
    expect(habitFormFrom(habit({ goalMinutes: 45 })).goalMinutes).toBe('45')
  })
})
