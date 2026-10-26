import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../../store/taskStore'
import type { Habit } from '../../types/habit'
import { HabitSlotPopover } from './HabitSlotPopover'

const anchor = { top: 100, left: 100, right: 200, bottom: 140 }
const OLD = '2026-01-01T00:00:00.000Z'
const habit: Habit = {
  id: 'gym',
  title: 'Gym',
  color: '#33B679',
  timeMode: 'none',
  startTime: null,
  endTime: null,
  frequency: { type: 'daily' },
  createdAt: OLD,
  updatedAt: OLD,
  completedDates: [],
  archivedAt: null,
}
const get = () => useTaskStore.getState().habits.find((h) => h.id === 'gym')!

function open() {
  useTaskStore.setState({ habits: [habit] })
  const onClose = vi.fn()
  render(<HabitSlotPopover habitId="gym" dateKey="2026-10-20" anchor={anchor} onClose={onClose} />)
  return onClose
}

describe('習慣の枠のカードの上のアイコン（#616）', () => {
  it('この日は休む: その日だけ休みにして閉じる（習慣は消さない）', async () => {
    const onClose = open()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Rest this day' }))
    expect(get().restDates).toEqual(['2026-10-20'])
    expect(get().deletedAt ?? null).toBeNull()
    expect(onClose).toHaveBeenCalled()
  })

  it('アーカイブと「時間を変える」はカードに出さない（時間は ✎ の編集画面で、#621）', () => {
    useTaskStore.setState({ habits: [{ ...habit, timeMode: 'range', startTime: '12:00', endTime: '13:00' }] })
    render(<HabitSlotPopover habitId="gym" dateKey="2099-10-20" anchor={anchor} onClose={() => {}} />)
    expect(screen.getByText(/12:00/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Change time' })).toBeNull()
  })

  it('格子に置いていない日は「習慣の段に戻す」を出さない', () => {
    open()
    expect(screen.queryByRole('button', { name: 'Move back to Habits row' })).toBeNull()
  })
})
