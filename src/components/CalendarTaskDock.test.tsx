import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { makeTask } from '../store/taskHelpers'
import { INBOX_LIST_ID } from '../store/storeConstants'
import { CalendarTaskDock } from './CalendarTaskDock'

describe('CalendarTaskDock: ラベルで絞る', () => {
  it('時刻の無い To-Do の色ごとのチップと「ラベルなし」で絞り、もう一度押すとすべてに戻る', () => {
    const at = (title: string, color: string | null, order: number) => ({
      ...makeTask({ title, listId: INBOX_LIST_ID, color: color ?? undefined }, order),
      id: title,
    })
    useTaskStore.setState({
      timeLogTagPresets: [],
      logCategoryColors: {},
      tasks: [
        at('Essay', '#D50000', 0),
        at('Slides', '#0B8043', 1),
        at('Laundry', null, 2),
        {
          ...makeTask(
            { title: 'Class', listId: INBOX_LIST_ID, color: '#7986CB', scheduledDate: '2026-10-07', startTime: '10:00', endTime: '11:00' },
            3,
          ),
          id: 'Class',
        },
      ],
    })
    render(<CalendarTaskDock />)
    // 時刻のある予定の色は出さない
    expect(screen.queryByRole('button', { name: 'Lavender' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Tomato' }))
    expect(screen.getByText('Essay')).toBeInTheDocument()
    expect(screen.queryByText('Slides')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'No label' }))
    expect(screen.getByText('Laundry')).toBeInTheDocument()
    expect(screen.queryByText('Essay')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'No label' }))
    expect(screen.getByText('Slides')).toBeInTheDocument()
  })
})
