import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { toDateKey } from '../lib/dateKey'
import { appToday } from '../lib/timeZone'
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
