import { render, screen, within } from '@testing-library/react'
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
