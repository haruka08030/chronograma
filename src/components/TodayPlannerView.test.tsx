import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { toDateKey } from '../lib/dateKey'
import { appToday } from '../lib/timeZone'
import { addDays } from 'date-fns'
import { TASK_DEFAULTS } from '../lib/taskDefaults'
import type { Task } from '../types/task'
import { TodayPlannerView } from './TodayPlannerView'

beforeAll(() => {
  // jsdom には無いもの（タイムラインの大きさ・候補の続きの読み込み・枠の行を見える所へ送る）
  Element.prototype.scrollIntoView = () => {}
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  globalThis.IntersectionObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  } as unknown as typeof IntersectionObserver
})

/** 今日やる行を 2 つ置く */
function planToday() {
  const today = toDateKey(appToday())
  const store = useTaskStore.getState()
  store.setPlannerDateKey(today)
  for (const title of ['Read paper', 'Write essay']) {
    const id = store.addTask(title)!
    useTaskStore.getState().updateTask(id, { scheduledDate: today })
  }
}

describe('TodayPlannerView（読み上げ）', () => {
  it('今日やる行は listbox の group の中の option', () => {
    planToday()
    render(<TodayPlannerView />)
    const list = screen.getByRole('listbox')
    const options = within(list).getAllByRole('option')
    expect(within(list).getByRole('option', { name: 'Read paper' })).toBeInTheDocument()
    expect(within(list).getByRole('option', { name: 'Write essay' })).toBeInTheDocument()
    expect(options).toHaveLength(2)
    for (const option of options) {
      expect(option).toHaveAttribute('aria-selected', 'false')
      expect(option.closest('[role="group"]')).not.toBeNull()
    }
    expect(screen.getByRole('checkbox', { name: 'Complete “Read paper”' })).toBeInTheDocument()
    // 追加欄は listbox の外
    expect(within(list).queryByRole('textbox')).toBeNull()
  })

  it('↓ で一覧にフォーカスが移り、aria-activedescendant が今の行を指す', async () => {
    planToday()
    const user = userEvent.setup()
    render(<TodayPlannerView />)
    const list = screen.getByRole('listbox')

    await user.keyboard('{ArrowDown}')
    expect(list).toHaveFocus()
    const first = document.getElementById(list.getAttribute('aria-activedescendant')!)
    expect(first).toHaveAttribute('role', 'option')

    await user.keyboard('{ArrowDown}')
    const second = document.getElementById(list.getAttribute('aria-activedescendant')!)
    expect(second).not.toBe(first)
    expect(second).toHaveAttribute('role', 'option')
  })
})

describe('TodayPlannerView: 見出しは振り返るときだけラベル別の時間（#542）', () => {
  const task = (id: string, over: Partial<Task>): Task =>
    ({
      ...TASK_DEFAULTS,
      id,
      title: id,
      description: '',
      completed: false,
      completedAt: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      order: 0,
      listId: 'inbox',
      sectionId: null,
      parentId: null,
      dueDate: null,
      startTime: null,
      endTime: null,
      priority: 'none',
      tags: [],
      recurrence: null,
      ...over,
    }) as Task

  it('過ぎた日はラベル別の時間だけ。記録の合計・予定の数・予定外・後から記録のボタンは出さない', () => {
    const day = toDateKey(addDays(appToday(), -1))
    useTaskStore.setState({
      tasks: [
        task('essay', { title: 'Essay', scheduledDate: day, startTime: '13:00', endTime: '14:00' }),
        task('yt', { kind: 'log', title: 'YouTube', dueDate: day, startTime: '20:00', endTime: '21:00', completed: true }),
      ],
    })
    useTaskStore.getState().setPlannerDateKey(day)
    const { container } = render(<TodayPlannerView />)
    const header = container.querySelector('header')!
    expect(within(header).getByRole('button', { name: 'Time by label' })).toBeInTheDocument()
    expect(header).not.toHaveTextContent(/logged|unplanned|unrecorded|of 1 plan/)
    expect(within(header).queryByRole('button', { name: 'Log past time' })).toBeNull()
  })

  it('今日の昼（締めの時刻の前）はラベル別の時間を出さない', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const now = new Date()
      now.setHours(13, 0, 0, 0)
      vi.setSystemTime(now)
      const day = toDateKey(appToday())
      useTaskStore.setState({
        tasks: [task('yt', { kind: 'log', title: 'YouTube', dueDate: day, startTime: '09:00', endTime: '10:00', completed: true })],
      })
      useTaskStore.getState().setPlannerDateKey(day)
      const { container } = render(<TodayPlannerView />)
      const header = container.querySelector('header')!
      expect(within(header).queryByRole('button', { name: 'Time by label' })).toBeNull()
      expect(within(header).getByRole('button', { name: 'Log past time' })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('TodayPlannerView: 続けて持ち越した日数（#300）', () => {
  const todo = (id: string, over: Partial<Task>): Task =>
    ({
      ...TASK_DEFAULTS,
      id,
      title: id,
      description: '',
      completed: false,
      completedAt: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      order: 0,
      listId: 'inbox',
      sectionId: null,
      parentId: null,
      dueDate: null,
      startTime: null,
      endTime: null,
      priority: 'none',
      tags: [],
      recurrence: null,
      ...over,
    }) as Task

  it('2 日以上の行にだけ「3日目」を出す。1 日の行・締切の過ぎた行・別の日を見ているときは出さない', () => {
    const today = toDateKey(appToday())
    const yesterday = toDateKey(addDays(appToday(), -1))
    useTaskStore.setState({
      tasks: [
        todo('ES', { scheduledDate: today, carriedDays: 2 }),
        todo('Once', { scheduledDate: today, carriedDays: 1 }),
        todo('Late', { scheduledDate: today, carriedDays: 4, dueDate: yesterday }),
      ],
    })
    useTaskStore.getState().setPlannerDateKey(today)
    const { unmount } = render(<TodayPlannerView />)
    const shown = [...document.querySelectorAll('[data-carry-days]')]
    expect(shown.map((x) => x.closest('[data-task-row]')?.getAttribute('data-task-row'))).toEqual(['ES'])
    expect(shown[0]!.textContent).toMatch(/^Day 3/)
    unmount()
    useTaskStore.getState().setPlannerDateKey(toDateKey(addDays(appToday(), 1)))
    useTaskStore.setState({ tasks: [todo('ES', { scheduledDate: toDateKey(addDays(appToday(), 1)), carriedDays: 2 })] })
    render(<TodayPlannerView />)
    expect(document.querySelector('[data-carry-days]')).toBeNull()
  })
})

describe('TodayPlannerView: 親の下の子の締切（#308）', () => {
  it('期限切れの子を親の名前つきで出す', () => {
    const today = toDateKey(appToday())
    const yesterday = toDateKey(addDays(appToday(), -1))
    const store = useTaskStore.getState()
    store.setPlannerDateKey(today)
    const parent = store.addTask('A Inc.')!
    const child = useTaskStore.getState().addTask('Web test', undefined, parent)!
    useTaskStore.getState().updateTask(child, { dueDate: yesterday })
    render(<TodayPlannerView />)
    const row = document.querySelector(`[data-task-row="${child}"]`)!
    expect(row).not.toBeNull()
    expect(row.querySelector('[data-parent-title]')!.textContent).toBe('A Inc.')
  })

  it('子の締切は子の行で出し、親の行には重ねない', async () => {
    const today = toDateKey(appToday())
    const store = useTaskStore.getState()
    store.setPlannerDateKey(today)
    const parent = store.addTask('B Corp')!
    const child = useTaskStore.getState().addTask('ES', undefined, parent)!
    useTaskStore.getState().updateTask(child, { dueDate: toDateKey(addDays(appToday(), 2)) })
    const user = userEvent.setup()
    render(<TodayPlannerView />)
    const toggle = screen.getByRole('button', { name: /Add from to-dos|Due soon/ })
    if (toggle.getAttribute('aria-expanded') === 'false') await user.click(toggle)
    const row = document.querySelector(`[data-task-row="${parent}"]`)!
    expect(row.querySelector('[data-child-due]')).toBeNull()
    expect(document.querySelector(`[data-task-row="${child}"]`)).not.toBeNull()
  })
})

describe('TodayPlannerView: 締切の見出しの「入りきらない」（#332）', () => {
  const todo = (id: string, over: Partial<Task>): Task =>
    ({
      ...TASK_DEFAULTS,
      id,
      title: id,
      description: '',
      completed: false,
      completedAt: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      order: 0,
      listId: 'inbox',
      sectionId: null,
      parentId: null,
      dueDate: null,
      startTime: null,
      endTime: null,
      priority: 'none',
      tags: [],
      recurrence: null,
      ...over,
    }) as Task

  it('見積もりが締切までの空きを超える見出しにだけ出す', async () => {
    const today = toDateKey(appToday())
    const inTwo = toDateKey(addDays(appToday(), 2))
    const inThree = toDateKey(addDays(appToday(), 3))
    useTaskStore.setState({
      dailyCapacityMinutes: 120,
      plannerCandidateView: { ...useTaskStore.getState().plannerCandidateView, sort: 'dueDate' },
      tasks: [todo('Report', { dueDate: inTwo, estimateMinutes: 600 }), todo('Memo', { dueDate: inThree })],
    })
    useTaskStore.getState().setPlannerDateKey(today)
    const user = userEvent.setup()
    render(<TodayPlannerView />)
    const toggle = screen.getByRole('button', { name: /Due soon/ })
    if (toggle.getAttribute('aria-expanded') === 'false') await user.click(toggle)
    // 2 日後: 見積もり 10 時間 / 空き 4 時間、3 日後: 前の締切の分も足して 10 時間 / 6 時間
    const marks = [...document.querySelectorAll('[data-due-fit="over"]')]
    expect(marks).toHaveLength(2)
    expect(marks[0]!.textContent).toMatch(/^won't fit/)
    // 空きが足りれば何も出さない
    act(() => void useTaskStore.setState({ dailyCapacityMinutes: 1440 }))
    expect(document.querySelectorAll('[data-due-fit]')).toHaveLength(0)
  })

  it('優先度順では見出しを足さず、入りきらない締切の行の締切を赤くして数字はツールチップ', async () => {
    const inTwo = toDateKey(addDays(appToday(), 2))
    const inFive = toDateKey(addDays(appToday(), 5))
    useTaskStore.setState({
      dailyCapacityMinutes: 120,
      plannerCandidateView: { ...useTaskStore.getState().plannerCandidateView, sort: 'priority' },
      tasks: [
        todo('Report', { dueDate: inTwo, estimateMinutes: 600, priority: 'high' }),
        todo('Memo', { dueDate: inTwo, order: 1 }),
        todo('Essay', { dueDate: inFive, estimateMinutes: 60, order: 2 }),
      ],
    })
    useTaskStore.getState().setPlannerDateKey(toDateKey(appToday()))
    const user = userEvent.setup()
    render(<TodayPlannerView />)
    const toggle = screen.getByRole('button', { name: /Add from to-dos|Due soon/ })
    if (toggle.getAttribute('aria-expanded') === 'false') await user.click(toggle)
    // 2 日後の締切: 見積もり 10 時間 / 空き 4 時間。見積もりの無い行も同じ締切なので赤。5 日後は 11 時間 / 10 時間で入りきらない
    const overRows = [...document.querySelectorAll('[data-due-fit="over"]')].map((el) =>
      el.closest('[data-task-row]')?.getAttribute('data-task-row'),
    )
    expect(overRows).toEqual(['Report', 'Memo', 'Essay'])
    expect(document.querySelector('[data-task-row="Report"] [data-due-fit]')!.textContent).toMatch(/Estimated 10h/)
    expect(screen.queryByText("won't fit")).toBeNull()
    // 空きが足りれば元の色のまま
    act(() => void useTaskStore.setState({ dailyCapacityMinutes: 1440 }))
    expect(document.querySelectorAll('[data-due-fit]')).toHaveLength(0)
  })
})

describe('TodayPlannerView: 候補は「さらに表示」で足す（#372）', () => {
  it('10 件ずつ出し、残りの件数のボタンで足す', async () => {
    const today = toDateKey(appToday())
    useTaskStore.setState({
      plannerCandidateView: { ...useTaskStore.getState().plannerCandidateView, sort: 'dueDate' },
      tasks: Array.from(
        { length: 13 },
        (_, i) =>
          ({
            ...TASK_DEFAULTS,
            id: `u${i}`,
            title: `Undated ${i}`,
            description: '',
            completed: false,
            completedAt: null,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
            order: i,
            listId: 'inbox',
            sectionId: null,
            parentId: null,
            dueDate: null,
            startTime: null,
            endTime: null,
            priority: 'none',
            tags: [],
            recurrence: null,
          }) as Task,
      ),
    })
    useTaskStore.getState().setPlannerDateKey(today)
    const user = userEvent.setup()
    render(<TodayPlannerView />)
    await user.click(screen.getByRole('button', { name: /Add from to-dos/ }))
    expect(document.querySelectorAll('[data-task-row^="u"]')).toHaveLength(10)
    await user.click(screen.getByRole('button', { name: 'Show more (3 left)' }))
    expect(document.querySelectorAll('[data-task-row^="u"]')).toHaveLength(13)
    expect(screen.queryByRole('button', { name: /Show more/ })).toBeNull()
  })
})

describe('TodayPlannerView: 締切切れの行の「今日やる」（#373）', () => {
  it('押すと今日やる行に移る', async () => {
    const today = toDateKey(appToday())
    const yesterday = toDateKey(addDays(appToday(), -1))
    const store = useTaskStore.getState()
    store.setPlannerDateKey(today)
    const id = store.addTask('Late report')!
    useTaskStore.getState().updateTask(id, { dueDate: yesterday })
    const user = userEvent.setup()
    render(<TodayPlannerView />)
    const row = document.querySelector(`[data-task-row="${id}"]`) as HTMLElement
    await user.click(within(row).getByRole('button', { name: 'Do today' }))
    expect(useTaskStore.getState().tasks.find((x) => x.id === id)!.scheduledDate).toBe(today)
  })
})

describe('TodayPlannerView: 候補の「すべて追加」（#375）', () => {
  it('件数と「元に戻す」を出す', async () => {
    const today = toDateKey(appToday())
    const inTwo = toDateKey(addDays(appToday(), 2))
    const inThree = toDateKey(addDays(appToday(), 3))
    const store = useTaskStore.getState()
    store.setPlannerDateKey(today)
    useTaskStore.setState({ plannerCandidateView: { ...store.plannerCandidateView, sort: 'dueDate' } })
    for (const title of ['Slides', 'Essay']) {
      const id = useTaskStore.getState().addTask(title)!
      useTaskStore.getState().updateTask(id, { scheduledDate: inThree, dueDate: inTwo })
    }
    const user = userEvent.setup()
    render(<TodayPlannerView />)
    const toggle = screen.getByRole('button', { name: /Due soon/ })
    if (toggle.getAttribute('aria-expanded') === 'false') await user.click(toggle)
    await user.click(screen.getByRole('button', { name: 'Do these 2 today' }))
    expect(useTaskStore.getState().undoBanner?.text).toBe('Moved 2 to today')
  })
})

describe('TodayPlannerView: 完了の行もキーで（#377）', () => {
  it('完了の欄を開くと ↓ で完了の行に行け、Space で完了を外す', async () => {
    const today = toDateKey(appToday())
    const store = useTaskStore.getState()
    store.setPlannerDateKey(today)
    const open = store.addTask('Open one')!
    useTaskStore.getState().updateTask(open, { scheduledDate: today })
    const done = useTaskStore.getState().addTask('Done one')!
    useTaskStore.getState().updateTask(done, { scheduledDate: today })
    useTaskStore.getState().toggleTask(done)
    const user = userEvent.setup()
    render(<TodayPlannerView />)
    const list = screen.getByRole('listbox')
    expect(within(list).getAllByRole('option')).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: '1 done' }))
    act(() => (document.activeElement as HTMLElement).blur())
    await user.keyboard('{ArrowDown}{ArrowDown}')
    const cursor = document.getElementById(list.getAttribute('aria-activedescendant')!)
    expect(cursor?.getAttribute('data-task-row')).toBe(done)
    await user.keyboard(' ')
    expect(useTaskStore.getState().tasks.find((x) => x.id === done)!.completed).toBe(false)
  })
})

describe('TodayPlannerView: 記録中の枠（#530）', () => {
  it('記録中は記録の列に始めた時刻からの枠を出し、止めたら記録の枠に置き換わる', () => {
    // 0 時すぎに流すと 1 時間前が前の日になる。昼に固定する
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(new Date().setHours(13, 0, 0, 0)))
    useTaskStore.getState().setPlannerDateKey(toDateKey(appToday()))
    useTaskStore.setState({ onboardingDone: true })
    useTaskStore.getState().startTimer('Essay', [])
    // 始めた時刻を 1 時間前にする（短い枠は 1 行で、終わりの「記録中」を出さない）
    useTaskStore.setState((s) => ({
      activeTimer: s.activeTimer && { ...s.activeTimer, startedAt: new Date(Date.now() - 60 * 60_000).toISOString() },
    }))
    const { container } = render(<TodayPlannerView />)
    const running = container.querySelector('[data-running-log]')
    expect(running).toHaveTextContent('Essay')
    expect(running).toHaveTextContent('Logging…')

    act(() => useTaskStore.getState().stopTimer())
    expect(container.querySelector('[data-running-log]')).toBeNull()
    const log = useTaskStore.getState().tasks.find((t) => t.kind === 'log' && t.title === 'Essay')!
    expect(container.querySelector(`[data-block-id="${log.id}"]`)).not.toBeNull()
    vi.useRealTimers()
  })
})

describe('TodayPlannerView: 足したばかりの行の締切（#533）', () => {
  it('追加欄から足した行は先の締切も出し、画面を開き直すと今日やる行の決まり（先の締切は出さない）に戻る', async () => {
    useTaskStore.getState().setPlannerDateKey(toDateKey(appToday()))
    useTaskStore.setState({ onboardingDone: true })
    const user = userEvent.setup()
    const { unmount } = render(<TodayPlannerView />)
    await user.type(screen.getByPlaceholderText(/^Add/), 'essay by tomorrow{Enter}')
    const row = () => document.querySelector('[data-task-row]')!
    expect(row()).toHaveTextContent(/Due /)
    unmount()
    render(<TodayPlannerView />)
    expect(row()).not.toHaveTextContent(/Due /)
  })
})
