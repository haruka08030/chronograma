import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { HabitsView } from './HabitsView'
import { useTaskStore } from '../store/taskStore'
import { appTodayKey } from '../lib/timeZone'

describe('習慣の画面: 新しい習慣のフォーム', () => {
  it('最初に見せるのは種類・名前・色・くり返し・「時間を決める」・「詳しく設定」だけ（#610）', async () => {
    const user = userEvent.setup()
    render(<HabitsView />)
    await user.click(screen.getByRole('button', { name: '+ Add habit' }))

    expect(
      within(screen.getByRole('radiogroup', { name: 'Repeat' }))
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['Daily', 'Specific days', 'Times a week'])
    // 時間の 3 択・1 回の目標は最初は出さない
    expect(screen.queryByRole('radiogroup', { name: 'Time' })).toBeNull()
    expect(screen.queryByRole('spinbutton')).toBeNull()
    expect(screen.getByRole('button', { name: 'More options' })).toBeInTheDocument()

    // 「時間を決める」で開始〜終了。終わりを外すと時刻だけ、時間を外すとボタンに戻る
    await user.click(screen.getByRole('button', { name: 'Set a time' }))
    expect(screen.getAllByRole('combobox')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Remove end time' }))
    expect(screen.getAllByRole('combobox')).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Remove time' }))
    expect(screen.getByRole('button', { name: 'Set a time' })).toBeInTheDocument()

    // 1 回の目標は「詳しく設定」の中
    await user.click(screen.getByRole('button', { name: 'More options' }))
    expect(screen.getByRole('spinbutton')).toBeInTheDocument()
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

  it('閉じても書きかけの名前は残り、画面を離れて戻っても続きから（#491）', async () => {
    const user = userEvent.setup()
    const first = render(<HabitsView />)
    await user.click(screen.getByRole('button', { name: '+ Add habit' }))
    await user.keyboard('Stretch')
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await user.click(screen.getByRole('button', { name: '+ Add habit' }))
    expect(screen.getByDisplayValue('Stretch')).toBeInTheDocument()
    first.unmount()

    render(<HabitsView />)
    await user.click(screen.getByRole('button', { name: '+ Add habit' }))
    expect(screen.getByDisplayValue('Stretch')).toBeInTheDocument()
  })

  it('空のときは例のボタン。押すとその名前で追加のカードが開く', async () => {
    const user = userEvent.setup()
    render(<HabitsView />)
    await user.click(screen.getByRole('button', { name: 'Add “Gym”' }))
    expect(screen.getByDisplayValue('Gym')).toBeInTheDocument()
    expect(screen.queryByText(/No habits yet/)).toBeNull()
  })
})

describe('習慣の画面: 休み', () => {
  it('日のマスを右クリックして「この日だけ」休みにし、同じメニューから外せる', async () => {
    const user = userEvent.setup()
    const todayKey = appTodayKey()
    useTaskStore.setState({
      habitsDateKey: todayKey,
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
  it('曜日を指定して時間を決めたときだけ「詳しく設定」に「曜日ごとに時間を変える」が出て、押すと選んだ曜日の行が出る', async () => {
    const user = userEvent.setup()
    render(<HabitsView />)
    await user.click(screen.getByRole('button', { name: '+ Add habit' }))
    await user.click(screen.getByRole('button', { name: 'More options' }))
    expect(screen.queryByRole('button', { name: 'Different time per day' })).toBeNull()
    await user.click(screen.getByRole('radio', { name: 'Specific days' }))
    expect(screen.queryByRole('button', { name: 'Different time per day' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Set a time' }))
    await user.click(screen.getByRole('button', { name: 'Different time per day' }))
    expect(screen.getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(
      expect.arrayContaining(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']),
    )
    await user.click(screen.getByRole('button', { name: 'Same time every day' }))
    expect(screen.queryByRole('group', { name: 'Mon' })).toBeNull()
  })

  it('曜日ごとに時間を変えた習慣は、同じ時間の曜日をまとめて出す', () => {
    useTaskStore.setState({
      habitsDateKey: appTodayKey(),
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
      habitsDateKey: appTodayKey(),
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

describe('習慣の画面: 週に◯回の行（#609）', () => {
  it('7 日の丸ではなく回数分の丸を出し、空いた丸で今日やった・塗った丸で外す', async () => {
    const user = userEvent.setup()
    useTaskStore.setState({
      habitsDateKey: appTodayKey(),
      habits: [
        {
          id: 'pack',
          title: 'Face mask',
          color: '#33B679',
          timeMode: 'none',
          startTime: null,
          endTime: null,
          frequency: { type: 'timesPerWeek', count: 2 },
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          completedDates: [],
          archivedAt: null,
        },
      ],
    })
    render(<HabitsView />)
    const row = document.querySelector<HTMLElement>('[data-habit-row="pack"]')!
    // 日のマスは無い
    expect(row.querySelector('[data-habit-day]')).toBeNull()
    expect(within(row).getAllByRole('button', { name: 'Done today' })).toHaveLength(2)
    expect(within(row).getByText('any day')).toBeInTheDocument()

    await user.click(within(row).getAllByRole('button', { name: 'Done today' })[0])
    expect(useTaskStore.getState().habits[0].completedDates).toEqual([appTodayKey()])
    // 今日はもう付けたので、残りの丸は押せない（別の日は詳細の月のカレンダーで）
    expect(within(row).getByRole('button', { name: 'Not yet' })).toBeDisabled()

    await user.click(within(row).getByRole('button', { name: /^Done on .* \(click to undo\)$/ }))
    expect(useTaskStore.getState().habits[0].completedDates).toEqual([])
  })
})
