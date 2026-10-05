import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useTaskStore } from '../../store/taskStore'
import { GoogleEventPopover } from './GoogleEventPopover'

const anchor = { top: 100, left: 100, right: 200, bottom: 140 }

function showEvent(description?: string) {
  useTaskStore.getState().setCalendarEvents([
    {
      id: 'g1',
      summary: '説明会',
      description,
      start: '2026-10-05T15:00:00+09:00',
      end: '2026-10-05T16:00:00+09:00',
      startTime: '15:00',
      endTime: '16:00',
      date: '2026-10-05',
      isAllDay: false,
    },
  ])
  return render(<GoogleEventPopover eventId="g1" anchor={anchor} onClose={() => {}} />)
}

describe('GoogleEventPopover', () => {
  it('shows the description as text, with its link short and openable', () => {
    showEvent(
      '持ち物: 筆記用具<br>参加 URL: <a href="https://zoom.us/j/1234567890?pwd=abcdefghijklmnop">https://zoom.us/j/1234567890?pwd=abcdefghijklmnop</a>',
    )
    expect(screen.getByText(/持ち物: 筆記用具/)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'zoom.us/j/…' })
    expect(link).toHaveAttribute('href', 'https://zoom.us/j/1234567890?pwd=abcdefghijklmnop')
  })

  it('shows nothing extra when the description is empty', () => {
    const { container } = showEvent('  ')
    expect(container.ownerDocument.querySelector('p.line-clamp-3')).toBeNull()
  })
})
