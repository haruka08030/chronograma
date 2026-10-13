import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { makeTask } from '../store/taskHelpers'
import { INBOX_LIST_ID } from '../store/storeConstants'
import { fromDateKey } from '../lib/dateKey'
import { CalendarView } from './CalendarView'

describe('CalendarView（月）: 押すと小さなカード', () => {
  function seed() {
    useTaskStore.setState({
      tasks: [{ ...makeTask({ title: 'レポート', listId: INBOX_LIST_ID, scheduledDate: '2026-10-07' }, 0), id: 'r1' }],
    })
    useTaskStore.getState().setCalendarEvents([
      {
        id: 'g1',
        summary: '説明会',
        start: '2026-10-08T15:00:00+09:00',
        end: '2026-10-08T16:00:00+09:00',
        startTime: '15:00',
        endTime: '16:00',
        date: '2026-10-08',
        isAllDay: false,
      },
    ])
  }

  it('Google の予定は Google の予定のカード、To-Do は予定のカード。日は選び直さない', async () => {
    seed()
    const onSelectDate = vi.fn()
    render(<CalendarView displayMonth={fromDateKey('2026-10-01')} selectedDateKey="2026-10-01" onSelectDate={onSelectDate} />)
    fireEvent.click(screen.getByText('説明会'))
    expect(await screen.findByRole('dialog', { name: '説明会' }, { timeout: 5000 })).toBeInTheDocument()
    fireEvent.click(screen.getByText('レポート'))
    expect(await screen.findByRole('dialog', { name: 'レポート' }, { timeout: 5000 })).toBeInTheDocument()
    expect(await screen.findByRole('dialog', { name: 'レポート' }, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: '説明会' })).toBeNull()
    expect(onSelectDate).not.toHaveBeenCalled()
  }, 20000)
})

describe('CalendarView（月）: ⌥ を押して落とすと複製（#398）', () => {
  /** ネイティブの D&D の中身（運んでいる To-Do の id） */
  const transfer = (id: string) => ({
    types: ['application/x-task-id'],
    getData: (type: string) => (type === 'application/x-task-id' ? id : ''),
    dropEffect: 'none',
    effectAllowed: 'copyMove',
  })
  const cellOf = (day: string) => screen.getAllByText(day).map((el) => el.closest<HTMLElement>('.group')!)[0]

  it('⌥ を押して別の日へ落とすと、元はそのままで時刻つきの複製がその日に入る。押さなければ動かす', () => {
    useTaskStore.setState({
      tasks: [
        {
          ...makeTask({ title: 'バイト', listId: INBOX_LIST_ID, scheduledDate: '2026-10-07', startTime: '17:00', endTime: '22:00' }, 0),
          id: 'b1',
        },
      ],
    })
    render(<CalendarView displayMonth={fromDateKey('2026-10-01')} selectedDateKey="2026-10-01" />)
    const tasks = () => useTaskStore.getState().tasks
    // ⌥ を押す（ドラッグ中の dragover で覚える状態と同じ）
    fireEvent.keyDown(window, { key: 'Alt', altKey: true })
    fireEvent.drop(cellOf('9'), { dataTransfer: transfer('b1'), altKey: true })
    fireEvent.keyUp(window, { key: 'Alt', altKey: false })
    expect(tasks().find((t) => t.id === 'b1')?.scheduledDate).toBe('2026-10-07')
    const copy = tasks().find((t) => t.id !== 'b1')!
    expect(copy).toMatchObject({ title: 'バイト', scheduledDate: '2026-10-09', startTime: '17:00', endTime: '22:00' })

    fireEvent.drop(cellOf('10'), { dataTransfer: transfer('b1') })
    expect(tasks()).toHaveLength(2)
    expect(tasks().find((t) => t.id === 'b1')?.scheduledDate).toBe('2026-10-10')
  })
})
