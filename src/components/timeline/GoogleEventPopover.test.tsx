import { fireEvent, render, screen } from '@testing-library/react'
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
    expect(container.ownerDocument.querySelector('p.whitespace-pre-line')).toBeNull()
  })
})

describe('GoogleEventPopover: 記録にする・▶', () => {
  it('終わった予定は「記録にする」だけ。押すと記録の画面を頼んでカードを閉じる', () => {
    showEvent()
    expect(screen.queryByRole('button', { name: 'Start logging' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Log it' }))
    expect(useTaskStore.getState().recordPromptTaskId).toBe('event-g1')
  })

  it('これからの予定は ▶ だけ。押すとその名前で記録を始める', () => {
    useTaskStore.getState().setCalendarEvents([
      {
        id: 'g2',
        summary: '面接',
        start: '2099-10-05T15:00:00+09:00',
        end: '2099-10-05T16:00:00+09:00',
        startTime: '15:00',
        endTime: '16:00',
        date: '2099-10-05',
        isAllDay: false,
      },
    ])
    render(<GoogleEventPopover eventId="g2" anchor={anchor} onClose={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Log it' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Start logging/ }))
    expect(useTaskStore.getState().activeTimer).toMatchObject({ taskTitle: '面接', taskId: null })
    useTaskStore.getState().stopTimer()
  })
})

describe('GoogleEventPopover: 色（#639）', () => {
  it('色の四角を押すと色の一覧。選んだ色はアプリだけに付き、書き込めない予定にも付けられる', () => {
    useTaskStore.setState({ googleCanWrite: false, googleEventColors: {} })
    showEvent()
    expect(screen.queryByRole('button', { name: 'More options' })).toBeNull()
    const button = screen.getByRole('button', { name: /^Change color/ })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(button)
    fireEvent.click(screen.getByRole('radio', { name: /Sage/ }))
    const { googleEventColors, calendarEvents } = useTaskStore.getState()
    expect(googleEventColors['e:g1']).toMatchObject({ title: '説明会' })
    expect(calendarEvents.find((e) => e.id === 'g1')?.color).toBe(googleEventColors['e:g1']!.hex)
    // 選んだら一覧は閉じる
    expect(screen.queryByRole('button', { name: /Use Google color/ })).toBeNull()
  })

  it('「Google の色に戻す」で付けた色を外す。繰り返しの予定はすべての回に付ける', () => {
    useTaskStore.setState({ googleEventColors: {} })
    useTaskStore.getState().setCalendarEvents([
      {
        id: 'g3_1',
        recurringEventId: 'g3',
        summary: 'ゼミ',
        start: '2026-10-05T15:00:00+09:00',
        end: '2026-10-05T16:00:00+09:00',
        startTime: '15:00',
        endTime: '16:00',
        date: '2026-10-05',
        isAllDay: false,
      },
    ])
    render(<GoogleEventPopover eventId="g3_1" anchor={anchor} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /^Change color/ }))
    fireEvent.click(screen.getByRole('radio', { name: /Sage/ }))
    expect(Object.keys(useTaskStore.getState().googleEventColors)).toEqual(['s:g3'])
    fireEvent.click(screen.getByRole('button', { name: /^Change color/ }))
    fireEvent.click(screen.getByRole('button', { name: /Use Google color/ }))
    expect(useTaskStore.getState().googleEventColors).toEqual({})
  })
})
