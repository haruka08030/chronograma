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

  it('空のときは例のボタン。押すとその名前で追加のカードが開く', async () => {
    const user = userEvent.setup()
    render(<HabitsView />)
    await user.click(screen.getByRole('button', { name: 'Put “Gym” in the add field' }))
    expect(screen.getByDisplayValue('Gym')).toBeInTheDocument()
    expect(screen.queryByText(/No habits yet/)).toBeNull()
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

describe('習慣の画面: 曜日ごとの時間', () => {
  it('曜日を指定して時間を決めたときだけ「曜日ごとに時間を変える」が出て、押すと選んだ曜日の行が出る', async () => {
    const user = userEvent.setup()
    render(<HabitsView />)
    await user.click(screen.getByRole('button', { name: '+ Add habit' }))
    expect(screen.queryByRole('button', { name: 'Different time per day' })).toBeNull()
    await user.click(screen.getByRole('radio', { name: 'Specific days' }))
    await user.click(screen.getByRole('button', { name: 'Different time per day' }))
    expect(screen.getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(
      expect.arrayContaining(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']),
    )
    await user.click(screen.getByRole('button', { name: 'Same time every day' }))
    expect(screen.queryByRole('group', { name: 'Mon' })).toBeNull()
  })

  it('曜日ごとに時間を変えた習慣は、同じ時間の曜日をまとめて出す', () => {
    useTaskStore.setState({
      selectedCalendarDateKey: appTodayKey(),
      habits: [
        {
          id: 'gym',
          title: 'Gym',
          color: '#33B679',
          timeMode: 'range',
          startTime: '18:00',
          endTime: '19:00',
          frequency: { type: 'weekly', weekdays: [1, 3, 6] },
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          completedDates: [],
          archivedAt: null,
          weekdayTimes: {
            1: { startTime: '18:00', endTime: '19:00' },
            3: { startTime: '18:00', endTime: '19:00' },
            6: { startTime: '10:00', endTime: '11:00' },
          },
        },
      ],
    })
    render(<HabitsView />)
    expect(screen.getByText(/^Mon, Wed 18:00 – 19:00; Sat 10:00 – 11:00$/)).toBeInTheDocument()
  })
})

describe('習慣の画面: 時間の目標', () => {
  it('一覧の行に「Daily · 30 min」と並べる', () => {
    useTaskStore.setState({
      selectedCalendarDateKey: appTodayKey(),
      habits: [
        {
          id: 'v',
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
          goalMinutes: 30,
        },
      ],
    })
    render(<HabitsView />)
    expect(screen.getByText('Daily · 30 min')).toBeInTheDocument()
  })
})
