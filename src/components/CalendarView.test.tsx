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
