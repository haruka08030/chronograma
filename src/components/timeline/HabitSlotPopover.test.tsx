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

describe('習慣の枠のカードの ▶（#648）', () => {
  const timed: Habit = { ...habit, timeMode: 'range', startTime: '07:00', endTime: '08:00' }

  it('終わった枠も達成していなければ ▶ を出す', () => {
    useTaskStore.setState({ habits: [timed] })
    render(<HabitSlotPopover habitId="gym" dateKey="2026-10-20" anchor={anchor} onClose={() => {}} />)
    expect(screen.getByRole('button', { name: 'Start logging' })).toBeInTheDocument()
  })

  it('達成した枠・やめた習慣の前の日の枠には出さない', () => {
    useTaskStore.setState({ habits: [{ ...timed, completedDates: ['2026-10-20'] }] })
    const first = render(<HabitSlotPopover habitId="gym" dateKey="2026-10-20" anchor={anchor} onClose={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Start logging' })).toBeNull()
    first.unmount()
    useTaskStore.setState({ habits: [{ ...timed, archivedAt: '2026-10-25T00:00:00.000Z', endedOn: '2026-10-25' }] })
    render(<HabitSlotPopover habitId="gym" dateKey="2026-10-20" anchor={anchor} onClose={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Start logging' })).toBeNull()
  })
})

describe('済んだ枠のカードのその日の記録（#661）', () => {
  const timed: Habit = { ...habit, timeMode: 'range', startTime: '07:00', endTime: '08:00' }
  const record = () => useTaskStore.getState().tasks.find((t) => t.habitId === 'gym' && !t.deletedAt)
  function openDone(onOpenRecord = vi.fn()) {
    useTaskStore.setState({ habits: [timed], tasks: [] })
    useTaskStore.getState().toggleHabitDate('gym', '2026-10-20')
    render(<HabitSlotPopover habitId="gym" dateKey="2026-10-20" anchor={anchor} onClose={() => {}} onOpenRecord={onOpenRecord} />)
    return onOpenRecord
  }

  it('記録の行を押すとその記録のカードを開く', async () => {
    const onOpenRecord = openDone()
    const id = record()!.id
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open record 07:00–08:00' }))
    expect(onOpenRecord).toHaveBeenCalledWith(id)
  })

  it('🗑 で記録を消すと未達成に戻る', async () => {
    openDone()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Delete record' }))
    expect(record()).toBeUndefined()
    expect(screen.queryByRole('button', { name: /Open record/ })).toBeNull()
  })

  it('まだの枠には記録の行を出さない', () => {
    useTaskStore.setState({ habits: [timed], tasks: [] })
    render(<HabitSlotPopover habitId="gym" dateKey="2026-10-20" anchor={anchor} onClose={() => {}} />)
    expect(screen.queryByRole('button', { name: /Open record/ })).toBeNull()
  })
})
