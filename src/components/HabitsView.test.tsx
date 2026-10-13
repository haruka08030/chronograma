import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { HabitsView } from './HabitsView'
import { useTaskStore } from '../store/taskStore'
import { appTodayKey } from '../lib/timeZone'

describe('習慣の画面: 新しい習慣のフォーム', () => {
  it('くり返しと時間のラジオは見出し付きの別のまとまりになる', async () => {
    const user = userEvent.setup()
    render(<HabitsView />)
    await user.click(screen.getByRole('button', { name: '+ Add habit' }))

    const repeat = screen.getByRole('radiogroup', { name: 'Repeat' })
    const time = screen.getByRole('radiogroup', { name: 'Time' })
    expect(screen.getByText('Repeat')).toBeVisible()
    expect(screen.getByText('Time')).toBeVisible()

    expect(
      within(repeat)
        .getAllByRole('radio')
        .map((r) => r.closest('label')?.textContent),
    ).toEqual(['Daily', 'Specific days', 'Times a week'])
    expect(
      within(time)
        .getAllByRole('radio')
        .map((r) => r.closest('label')?.textContent),
    ).toEqual(['No time', 'Set time', 'Set time range'])
    expect(within(repeat).getByRole('radio', { name: 'Daily' })).toBeChecked()
    expect(within(time).getByRole('radio', { name: 'Set time range' })).toBeChecked()
    // 時間帯の欄の前に「Time」を繰り返さない（見出しが 1 つだけ）
    expect(screen.getAllByText('Time')).toHaveLength(1)

    // まとまりごとに 1 つ選ぶ（片方を選んでももう片方は変わらない）
    await user.click(within(time).getByRole('radio', { name: 'No time' }))
    expect(within(time).getByRole('radio', { name: 'No time' })).toBeChecked()
    expect(within(repeat).getByRole('radio', { name: 'Daily' })).toBeChecked()
    await user.click(within(repeat).getByRole('radio', { name: 'Times a week' }))
    expect(within(repeat).getByRole('radio', { name: 'Times a week' })).toBeChecked()
    expect(within(time).getByRole('radio', { name: 'No time' })).toBeChecked()
  })

  it('フォームを開いている間は「右上の＋習慣を追加」の案内を出さない', async () => {
    const user = userEvent.setup()
    render(<HabitsView />)
    expect(screen.getByText(/No habits yet/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '+ Add habit' }))
    expect(screen.queryByText(/No habits yet/)).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.getByText(/No habits yet/)).toBeInTheDocument()
  })
})

describe('習慣の画面: 休み', () => {
  it('日のマスを右クリックして「この日だけ」休みにし、同じメニューから外せる', async () => {
    const user = userEvent.setup()
    const todayKey = appTodayKey()
    useTaskStore.setState({
      selectedCalendarDateKey: todayKey,
      habits: [
        {
          id: 'h',
          title: 'Vocab',
          color: '#33B679',
          timeMode: 'none',
          startTime: null,
          endTime: null,
          frequency: { type: 'daily' },
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          completedDates: [],
          archivedAt: null,
        },
      ],
    })
    render(<HabitsView />)
    const cell = () => document.querySelector<HTMLElement>(`[data-habit-day="${todayKey}"]`)!
    fireEvent.contextMenu(cell())
    await user.click(screen.getByRole('menuitem', { name: /^Rest/ }))
    await user.click(screen.getByRole('menuitem', { name: 'This day only' }))
    expect(useTaskStore.getState().habits[0].restDates).toEqual([todayKey])
    expect(cell()).toHaveAccessibleName(/rest$/)

    fireEvent.contextMenu(cell())
    await user.click(screen.getByRole('menuitem', { name: /^End rest/ }))
    expect(useTaskStore.getState().habits[0]).not.toHaveProperty('restDates')
  })
})
