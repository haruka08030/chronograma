import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../../store/taskStore'
import { migrateTaskState } from '../../store/migrate'
import { toDateKey } from '../../lib/dateKey'
import { appToday } from '../../lib/timeZone'
import { TodayPlannerView } from '../TodayPlannerView'
import { ONBOARDING_DONE_MS } from './PlannerOnboarding'

beforeAll(() => {
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

const guide = () => screen.queryByRole('region', { name: 'Getting started' })
const step = (name: string) => within(guide()!).getByText(name).closest('li')!

function openToday() {
  useTaskStore.getState().setSelectedCalendarDateKey(toDateKey(appToday()))
  render(<TodayPlannerView />)
}

describe('はじめの 3 ステップ', () => {
  it('案内が出ている間は睡眠の行を出さず、締切の例も選べる', () => {
    // 睡眠の行は朝から出る。昼に固定して、案内のない人なら出る時刻で確かめる
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(new Date().setHours(13, 0, 0, 0)))
    openToday()
    expect(screen.queryByText('Log your sleep?')).not.toBeInTheDocument()
    expect(within(guide()!).getByRole('button', { name: 'Put “essay by tomorrow” in the add field' })).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('新しい人には今日の画面に 3 ステップを出し、やると順にチェックが付く', async () => {
    const user = userEvent.setup()
    openToday()
    expect(guide()).toBeInTheDocument()
    expect(within(guide()!).getAllByRole('listitem')).toHaveLength(3)
    // 書き方の例は案内の方に出す（追加欄の例と 2 回出さない）
    const input = screen.getByPlaceholderText('Add')

    // 例を押すと追加欄に入る。Enter で足すと、時刻つきなので ① と ② が済む
    await user.click(screen.getByRole('button', { name: 'Put “3pm essay 1h” in the add field' }))
    expect(input).toHaveValue('3pm essay 1h')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(step('Add one thing to do')).toHaveTextContent('(done)')
    expect(step('Give it a time')).toHaveTextContent('(done)')
    expect(step('Record it with ▶')).not.toHaveTextContent('(done)')
    // 説明は次にやるステップだけ
    expect(within(guide()!).getByText(/Press ▶ on the row/)).toBeInTheDocument()
    expect(within(guide()!).queryByText(/Drag it onto the timeline/)).toBeNull()
  })

  it('3 つ終わると「できました」を出し、少しして消え、二度と出ない', () => {
    vi.useFakeTimers()
    try {
      const store = useTaskStore.getState()
      const id = store.addTask('Essay')!
      useTaskStore.getState().updateTask(id, { scheduledDate: toDateKey(appToday()), startTime: '15:00', endTime: '16:00' })
      openToday()
      expect(guide()).toBeInTheDocument()
      act(() => useTaskStore.getState().startTimer('Essay', [], id))
      expect(screen.getByRole('status')).toHaveTextContent('All set')
      act(() => vi.advanceTimersByTime(ONBOARDING_DONE_MS))
      expect(screen.queryByText(/All set/)).toBeNull()
      expect(useTaskStore.getState().onboardingDone).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('× で閉じたら二度と出ない', async () => {
    const user = userEvent.setup()
    openToday()
    await user.click(screen.getByRole('button', { name: 'Close the guide' }))
    expect(guide()).toBeNull()
    expect(useTaskStore.getState().onboardingDone).toBe(true)
  })

  it('前から使っている人（データを引き継いだ人）には出さない', () => {
    const migrated = migrateTaskState({ tasks: [{ id: 'x', title: 'Gym', kind: 'todo' }], lists: [], sections: [], habits: [] }, 38)
    useTaskStore.setState({ onboardingDone: migrated.onboardingDone })
    openToday()
    expect(guide()).toBeNull()
    expect(screen.getByPlaceholderText('Add (e.g. essay by tomorrow)')).toBeInTheDocument()
  })

  it('今日以外の日には出さない', () => {
    useTaskStore.getState().setSelectedCalendarDateKey('2020-01-01')
    render(<TodayPlannerView />)
    expect(guide()).toBeNull()
  })
})
