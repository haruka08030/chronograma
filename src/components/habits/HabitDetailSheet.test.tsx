import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Habit } from '../../types/habit'
import { buildHabitRecordIndex } from '../../lib/habitTiming'
import { HabitDetailSheet } from './HabitDetailSheet'
import { useTaskStore } from '../../store/taskStore'

const OLD = '2026-01-01T00:00:00.000Z'
const habit: Habit = {
  id: 'lunch',
  title: 'Lunch',
  color: '#8E24AA',
  timeMode: 'range',
  startTime: '12:10',
  endTime: '13:00',
  frequency: { type: 'daily' },
  createdAt: OLD,
  updatedAt: OLD,
  completedDates: [],
  archivedAt: null,
}

function open(dateKey: string | null) {
  render(
    <HabitDetailSheet
      habit={habit}
      habitRecords={buildHabitRecordIndex([])}
      todayKey="2026-10-26"
      closing={false}
      startEditing
      dateKey={dateKey}
      onClose={() => {}}
    />,
  )
}

describe('タイムラインから開いた習慣の編集（#621）', () => {
  it('上にその日の時間と「時間を変える」を出し、押すとその場で直す欄を開く', async () => {
    open('2026-10-30')
    expect(screen.getByText(/^Time on /)).toBeInTheDocument()
    expect(screen.getByText('12:10 – 13:00')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Change time' }))
    // 直す欄と編集のフォームで、保存・キャンセルが 2 組になる
    expect(screen.getAllByRole('button', { name: 'Save' })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Change time' })).toBeNull()
  })

  it('習慣の画面から開いたときは出さない', () => {
    open(null)
    expect(screen.queryByText(/^Time on /)).toBeNull()
  })

  it('過ぎた日は出さない', () => {
    open('2026-10-20')
    expect(screen.queryByText(/^Time on /)).toBeNull()
  })
})

describe('習慣の詳細の下のボタン', () => {
  it('「休む」は見えるボタンから選べ（この日だけ）、削除は確認なし', async () => {
    const user = userEvent.setup()
    useTaskStore.setState({ habits: [habit] })
    render(
      <HabitDetailSheet habit={habit} habitRecords={buildHabitRecordIndex([])} todayKey="2026-10-26" closing={false} onClose={() => {}} />,
    )
    await user.click(screen.getByRole('button', { name: 'Rest' }))
    await user.click(screen.getByRole('menuitem', { name: /This day only/ }))
    expect(useTaskStore.getState().habits.find((h) => h.id === 'lunch')?.restDates).toEqual(['2026-10-26'])
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(useTaskStore.getState().habits.find((h) => h.id === 'lunch')?.deletedAt).toBeTruthy()
  })
})
