import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../../store/taskStore'
import type { Habit } from '../../types/habit'
import { PlannerAddInput } from './PlannerAddInput'

// ジム: 月・水 18:00〜19:00
const gym: Habit = {
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
}
const MON = '2026-10-12'
const TUE = '2026-10-13'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 12, 12))
  useTaskStore.setState({ habits: [gym], tasks: [] })
})
afterEach(() => vi.useRealTimers())

const type = (text: string) => fireEvent.change(screen.getByRole('textbox'), { target: { value: text } })
const useHabit = () => screen.queryByRole('button', { name: /Use the habit/ })

describe('今日の計画の追加欄: 習慣と同じ名前（#711）', () => {
  it('同じ名前だけ候補に出す（前が合うだけ・違う名前では出さない）', () => {
    render(<PlannerAddInput dateKey={MON} showExample={false} />)
    type('ジ')
    expect(useHabit()).toBeNull()
    type('ジム')
    expect(useHabit()).toBeInTheDocument()
  })

  it('習慣の日なら To-Do を作らずに欄を空にする', () => {
    render(<PlannerAddInput dateKey={MON} showExample={false} />)
    type('ジム')
    fireEvent.click(useHabit()!)
    expect(useTaskStore.getState().tasks).toHaveLength(0)
    expect(screen.getByRole('textbox')).toHaveValue('')
  })

  it('習慣の日でなければ、習慣の時刻でその日もやる日にする', () => {
    render(<PlannerAddInput dateKey={TUE} showExample={false} />)
    type('ジム')
    fireEvent.click(useHabit()!)
    expect(useTaskStore.getState().tasks).toHaveLength(0)
    expect(useTaskStore.getState().habits[0]!.timeOverrides?.[TUE]).toEqual({ startTime: '18:00', endTime: '19:00', extra: true })
  })
})
