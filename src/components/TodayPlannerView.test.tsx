import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it } from 'vitest'
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
  store.setSelectedCalendarDateKey(today)
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

describe('TodayPlannerView: 過ぎた日のその日の結果（#282）', () => {
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

  it('予定 / 空きの代わりに「予定 2 件中 1 件・予定外」を出し、押すと週のふりかえりを開く', async () => {
    const day = toDateKey(addDays(appToday(), -1))
    useTaskStore.setState({
      tasks: [
        task('seminar', { title: 'Seminar', scheduledDate: day, startTime: '09:00', endTime: '10:00' }),
        task('essay', { title: 'Essay', scheduledDate: day, startTime: '13:00', endTime: '14:00' }),
        task('seminarLog', { kind: 'log', title: 'Seminar', dueDate: day, startTime: '09:00', endTime: '10:00', completed: true }),
        task('yt', { kind: 'log', title: 'YouTube', dueDate: day, startTime: '20:00', endTime: '21:00', completed: true }),
      ],
    })
    useTaskStore.getState().setSelectedCalendarDateKey(day)
    const user = userEvent.setup()
    render(<TodayPlannerView />)
    const result = document.querySelector('[data-day-result]')!
    expect(result.textContent).toMatch(/^1 of 2 plans · 1h unplanned/)
    // 記録の時間は左の 1 か所だけ（結果の行に重ねない）
    expect(screen.getAllByText('2h logged')).toHaveLength(1)
    expect(document.querySelector('[data-day-free]')).toBeNull()
    await user.click(result)
    expect(useTaskStore.getState().selectedView).toBe('stats')
  })

  it('時間に置いた予定が無い過ぎた日は今のまま（結果の行を出さない）', () => {
    const day = toDateKey(addDays(appToday(), -1))
    useTaskStore.setState({
      tasks: [task('yt', { kind: 'log', title: 'YouTube', dueDate: day, startTime: '20:00', endTime: '21:00', completed: true })],
    })
    useTaskStore.getState().setSelectedCalendarDateKey(day)
    render(<TodayPlannerView />)
    expect(document.querySelector('[data-day-result]')).toBeNull()
    expect(screen.getByText('1h logged')).toBeInTheDocument()
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
    useTaskStore.getState().setSelectedCalendarDateKey(today)
    const { unmount } = render(<TodayPlannerView />)
    const shown = [...document.querySelectorAll('[data-carry-days]')]
    expect(shown.map((x) => x.closest('[data-task-row]')?.getAttribute('data-task-row'))).toEqual(['ES'])
    expect(shown[0]!.textContent).toMatch(/^Day 3/)
    unmount()
    useTaskStore.getState().setSelectedCalendarDateKey(toDateKey(addDays(appToday(), 1)))
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
    store.setSelectedCalendarDateKey(today)
    const parent = store.addTask('A Inc.')!
    const child = useTaskStore.getState().addTask('Web test', undefined, parent)!
    useTaskStore.getState().updateTask(child, { dueDate: yesterday })
    render(<TodayPlannerView />)
    const row = document.querySelector(`[data-task-row="${child}"]`)!
    expect(row).not.toBeNull()
    expect(row.querySelector('[data-parent-title]')!.textContent).toBe('A Inc.')
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
    useTaskStore.getState().setSelectedCalendarDateKey(today)
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
    useTaskStore.getState().setSelectedCalendarDateKey(today)
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
    store.setSelectedCalendarDateKey(today)
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
    store.setSelectedCalendarDateKey(today)
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
