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
