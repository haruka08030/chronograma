import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import type { Habit } from '../types/habit'
import { HabitContextMenu } from './HabitContextMenu'

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

function open(onTimeline: boolean) {
  useTaskStore.setState({ habits: [habit] })
  render(<HabitContextMenu x={0} y={0} habitId="gym" dateKey="2026-10-20" onClose={() => {}} onEdit={() => {}} onTimeline={onTimeline} />)
}

describe('習慣のメニューの削除（#614）', () => {
  it('タイムラインでは習慣そのものの削除を出さない（その日だけ外すのは「休む」1 つ、#616）', () => {
    open(true)
    expect(screen.queryByRole('menuitem', { name: 'Delete' })).toBeNull()
    expect(screen.getAllByRole('menuitem', { name: /Rest/ })).toHaveLength(1)
  })

  it('習慣の画面では習慣そのものを消す', async () => {
    open(false)
    await userEvent.setup().click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(get().deletedAt).toBeTruthy()
  })
})
