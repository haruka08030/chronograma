import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { RecordPromptHost } from './RecordPromptHost'

describe('RecordPromptHost: Google の予定', () => {
  it('Google の予定のカードの「記録にする」は、その時刻のまま記録を足す画面を開く', async () => {
    useTaskStore.setState({ tasks: [] })
    useTaskStore.getState().setCalendarEvents([
      {
        id: 'g1',
        summary: '説明会',
        start: '2026-10-05T15:00:00+09:00',
        end: '2026-10-05T16:00:00+09:00',
        startTime: '15:00',
        endTime: '16:00',
        date: '2026-10-05',
        isAllDay: false,
      },
    ])
    render(<RecordPromptHost />)
    act(() => useTaskStore.getState().openRecordPrompt('event-g1'))
    const dialog = await screen.findByRole('dialog', {}, { timeout: 5000 })
    // 保存は最後のボタン（取り消しの右）
    const buttons = dialog.querySelectorAll('button')
    fireEvent.click(buttons[buttons.length - 1]!)
    expect(useTaskStore.getState().tasks.find((t) => t.title === '説明会')).toMatchObject({
      kind: 'log',
      startTime: '15:00',
      endTime: '16:00',
    })
  }, 20000)
})
