import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Habit } from '../../types/habit'
import type { Task } from '../../types/task'
import { TASK_DEFAULTS } from '../../lib/taskDefaults'
import { useTaskStore } from '../../store/taskStore'
import { PlannerHabitRows, PlannerHabits } from './PlannerHabits'
import { splitHabitDayKey } from '../../lib/habitDayKey'
import { usePlannerHabitRows } from '../../hooks/usePlannerHabitRows'
import { closeHabitEdit, useHabitEditTarget } from '../../lib/habitEditRequest'
import { COMPLETE_COLLAPSE_MS, COMPLETE_LINGER_MS, useDeferredComplete } from '../../hooks/useDeferredComplete'

/** 今日の計画と同じ組み立て: まだの習慣は「習慣」の欄、済んだ習慣は「完了」の中の行 */
function Habits({ dayHabits }: { dayHabits: Habit[] }) {
  const rows = usePlannerHabitRows(dayHabits, DAY)
  const toggleHabitDate = useTaskStore((s) => s.toggleHabitDate)
  const deferred = useDeferredComplete((key) => toggleHabitDate(...splitHabitDayKey(key)))
  return (
    <>
      <PlannerHabits
        rows={rows.open}
        habitRecords={rows.habitRecords}
        dateKey={DAY}
        viewingToday={false}
        headingClass=""
        deferred={deferred}
      />
      <div data-done>
        <PlannerHabitRows rows={rows.done} habitRecords={rows.habitRecords} dateKey={DAY} viewingToday={false} />
      </div>
    </>
  )
}

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
  it('届いていない日は行の右に「12/30 min」、届いたら「習慣」の欄から外れて「完了」の中の行になる（見出しも消える）', () => {
    useTaskStore.setState({ habits: [vocab], tasks: [record('08:00', '08:12')] })
    const { rerender, container } = render(<Habits dayHabits={[vocab]} />)
    expect(screen.getByText('12/30 min')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Vocab' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('heading', { name: 'Habits' })).toBeInTheDocument()

    useTaskStore.setState({ tasks: [record('08:00', '08:12'), record('20:00', '20:20')] })
    rerender(<Habits dayHabits={[vocab]} />)
    expect(screen.queryByText(/\/30 min/)).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Habits' })).toBeNull()
    const done = container.querySelector('[data-done]') as HTMLElement
    expect(done).toContainElement(screen.getByRole('checkbox', { name: 'Vocab' }))
    expect(screen.getByRole('checkbox', { name: 'Vocab' })).toHaveAttribute('aria-checked', 'true')
  })

  it('時刻のある習慣を時刻順に先に、時間なしを後ろに並べ、時刻と今週の回数を出す', () => {
    const base = { ...vocab, goalMinutes: undefined, completedDates: [] as string[] }
    const late = { ...base, id: 'late', title: 'Late', timeMode: 'fixed' as const, startTime: '21:00', endTime: null }
    const early = { ...base, id: 'early', title: 'Early', timeMode: 'range' as const, startTime: '07:00', endTime: '07:30' }
    const puff = { ...base, id: 'puff', title: 'Puff', timeMode: 'none' as const, startTime: null, endTime: null }
    const weekly = { ...puff, id: 'weekly', title: 'Weekly', frequency: { type: 'timesPerWeek' as const, count: 2 } }
    const all = [puff, late, weekly, early]
    useTaskStore.setState({ habits: all, tasks: [] })
    render(<Habits dayHabits={all} />)
    expect(screen.getAllByRole('checkbox').map((c) => c.getAttribute('aria-label'))).toEqual(['Early', 'Late', 'Puff', 'Weekly'])
    expect(screen.getByText('07:00–07:30')).toBeInTheDocument()
    expect(screen.getByText('21:00')).toBeInTheDocument()
    expect(screen.getByText('This week 0/2')).toBeInTheDocument()
  })
})

describe('今日の計画の習慣: 達成にしたとき', () => {
  const bath: Habit = { ...vocab, id: 'bath', title: 'Bath', goalMinutes: undefined, completedDates: [] }
  const doneBox = (c: HTMLElement) => c.querySelector('[data-done]') as HTMLElement

  it('押した行は済んだ見た目でその場に残り、0.6 秒後に縮んでから「完了」の中へ移る', () => {
    vi.useFakeTimers()
    try {
      useTaskStore.setState({ habits: [bath], tasks: [] })
      const { container, rerender } = render(<Habits dayHabits={[bath]} />)
      fireEvent.click(screen.getByRole('checkbox', { name: 'Bath' }))
      // その場に残り、もう達成の見た目
      expect(doneBox(container)).not.toContainElement(screen.getByRole('checkbox', { name: 'Bath' }))
      expect(screen.getByRole('checkbox', { name: 'Bath' })).toHaveAttribute('aria-checked', 'true')
      expect(useTaskStore.getState().habits[0].completedDates).toEqual([])

      act(() => void vi.advanceTimersByTime(COMPLETE_LINGER_MS))
      expect(screen.getByRole('checkbox', { name: 'Bath' }).closest('li')).toHaveClass('animate-row-collapse')

      act(() => void vi.advanceTimersByTime(COMPLETE_COLLAPSE_MS))
      expect(useTaskStore.getState().habits[0].completedDates).toEqual([DAY])
      rerender(<Habits dayHabits={useTaskStore.getState().habits} />)
      expect(doneBox(container)).toContainElement(screen.getByRole('checkbox', { name: 'Bath' }))
    } finally {
      vi.useRealTimers()
    }
  })

  it('残っている間にもう一度押すと取り消し、達成にしない', () => {
    vi.useFakeTimers()
    try {
      useTaskStore.setState({ habits: [bath], tasks: [] })
      render(<Habits dayHabits={[bath]} />)
      fireEvent.click(screen.getByRole('checkbox', { name: 'Bath' }))
      act(() => void vi.advanceTimersByTime(500))
      fireEvent.click(screen.getByRole('checkbox', { name: 'Bath' }))
      expect(screen.getByRole('checkbox', { name: 'Bath' })).toHaveAttribute('aria-checked', 'false')
      act(() => void vi.advanceTimersByTime(COMPLETE_LINGER_MS + COMPLETE_COLLAPSE_MS))
      expect(useTaskStore.getState().habits[0].completedDates).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('今日の計画の習慣の行を押す', () => {
  function Target() {
    const target = useHabitEditTarget()
    return <output aria-label="target">{target ? `${target.habitId}:${target.edit}` : ''}</output>
  }
  it('名前を押すと、画面を移らずに習慣の詳細（編集ではない）を開く', () => {
    render(
      <>
        <Habits dayHabits={[vocab]} />
        <Target />
      </>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Vocab' }))
    expect(screen.getByRole('status', { name: 'target' })).toHaveTextContent('v:false')
    act(() => closeHabitEdit())
  })
})
