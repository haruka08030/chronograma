import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Habit } from '../../types/habit'
import type { Task } from '../../types/task'
import { TASK_DEFAULTS } from '../../lib/taskDefaults'
import { useTaskStore } from '../../store/taskStore'
import { PlannerHabits } from './PlannerHabits'

const DAY = '2026-10-13'
const OLD = '2026-01-01T00:00:00.000Z'

const vocab: Habit = {
  id: 'v',
  title: 'Vocab',
  color: '#33B679',
  timeMode: 'none',
  startTime: null,
  endTime: null,
  frequency: { type: 'daily' },
  createdAt: OLD,
  updatedAt: OLD,
  completedDates: [],
  archivedAt: null,
  goalMinutes: 30,
}

const record = (startTime: string, endTime: string): Task => ({
  ...TASK_DEFAULTS,
  id: `r-${startTime}`,
  title: 'Vocab',
  description: '',
  completed: true,
  completedAt: OLD,
  createdAt: OLD,
  updatedAt: OLD,
  order: 0,
  listId: '__inbox__',
  sectionId: null,
  parentId: null,
  dueDate: DAY,
  startTime,
  endTime,
  priority: 'none',
  tags: [],
  recurrence: null,
  kind: 'log',
  habitId: 'v',
})

describe('今日の計画の習慣: 時間の目標', () => {
  it('届いていない日はリングの下に「12/30 min」、届いたら達成で何も出さない', () => {
    useTaskStore.setState({ habits: [vocab], tasks: [record('08:00', '08:12')] })
    const { rerender } = render(<PlannerHabits dayHabits={[vocab]} dateKey={DAY} viewingToday={false} headingClass="" />)
    expect(screen.getByText('12/30 min')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Vocab' })).toHaveAttribute('aria-pressed', 'false')

    useTaskStore.setState({ tasks: [record('08:00', '08:12'), record('20:00', '20:20')] })
    rerender(<PlannerHabits dayHabits={[vocab]} dateKey={DAY} viewingToday={false} headingClass="" />)
    expect(screen.queryByText(/\/30 min/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Vocab' })).toHaveAttribute('aria-pressed', 'true')
  })
})
