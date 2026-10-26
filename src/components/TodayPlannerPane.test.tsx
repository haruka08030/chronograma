import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { openWrapUpFromNotification } from '../lib/notificationLaunch'
import { forgetPlannerPane } from '../lib/plannerPane'
import { TodayPlannerView } from './TodayPlannerView'

/**
 * スマホの今日の計画で最初に出す面: 選ぶ前（今日の締めの時刻まで・先の日）は「やること」、
 * 決めた後（過ぎた日・今日の締めの時刻から・夜の通知から）は予定と記録が並ぶ「タイムライン」。
 * タブで選んだら、その日のうちはそれに従う。はじめの案内を終えるまでは「やること」
 */

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

const TODAY = '2026-10-08'
const YESTERDAY = '2026-10-07'

function at(hour: number, minute = 0) {
  vi.setSystemTime(new Date(2026, 9, 8, hour, minute, 0))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  at(10)
  forgetPlannerPane()
  useTaskStore.setState({ tasks: [], onboardingDone: true, dailyReminders: { planTime: null, wrapUpTime: null } })
  useTaskStore.getState().setPlannerDateKey(TODAY)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** 選ばれているタブ（'To do' / 'Timeline'） */
const shownPane = () => screen.getByRole('tab', { selected: true }).textContent

describe('スマホで最初に出す面', () => {
  it('朝の今日は「やること」から', () => {
    render(<TodayPlannerView />)
    expect(shownPane()).toBe('To do')
  })

  it('過ぎた日はタイムラインから（ふりかえりの棒から開いたときも同じ）', () => {
    useTaskStore.getState().setPlannerDateKey(YESTERDAY)
    render(<TodayPlannerView />)
    expect(shownPane()).toBe('Timeline')
  })

  it('今日でも締めの時刻（未設定は 17 時）を過ぎて開いたらタイムラインから', () => {
    at(17)
    render(<TodayPlannerView />)
    expect(shownPane()).toBe('Timeline')
  })

  it('はじめの案内を終えるまでは、締めの時刻を過ぎても「やること」から（案内はそちらにある）', () => {
    useTaskStore.setState({ onboardingDone: false })
    at(21)
    render(<TodayPlannerView />)
    expect(shownPane()).toBe('To do')
  })

  it('夜のまとめの時刻を決めていれば、その時刻から', () => {
    useTaskStore.setState({ dailyReminders: { planTime: null, wrapUpTime: '21:30' } })
    at(21, 29)
    const { unmount } = render(<TodayPlannerView />)
    expect(shownPane()).toBe('To do')
    unmount()
    at(21, 30)
    render(<TodayPlannerView />)
    expect(shownPane()).toBe('Timeline')
  })

  it('前の日へ移ると、その日の面（タイムライン）に、今日へ戻ると「やること」に', async () => {
    const user = userEvent.setup()
    render(<TodayPlannerView />)
    await user.click(screen.getAllByRole('button', { name: 'Previous day' })[0])
    expect(shownPane()).toBe('Timeline')
    await user.click(screen.getAllByRole('button', { name: 'Next day' })[0])
    expect(shownPane()).toBe('To do')
  })

  it('タブで選んだら、その日のうちは過ぎた日を開いても・開き直しても従う', async () => {
    const user = userEvent.setup()
    useTaskStore.getState().setPlannerDateKey(YESTERDAY)
    const { unmount } = render(<TodayPlannerView />)
    await user.click(screen.getByRole('tab', { name: 'To do' }))
    expect(shownPane()).toBe('To do')
    unmount()
    render(<TodayPlannerView />)
    expect(shownPane()).toBe('To do')
  })

  it('選んだ面は日をまたいだら忘れる', async () => {
    const user = userEvent.setup()
    useTaskStore.getState().setPlannerDateKey(YESTERDAY)
    const { unmount } = render(<TodayPlannerView />)
    await user.click(screen.getByRole('tab', { name: 'To do' }))
    unmount()
    vi.setSystemTime(new Date(2026, 9, 9, 10))
    render(<TodayPlannerView />)
    expect(shownPane()).toBe('Timeline')
  })

  it('見ている間に締めの時刻を過ぎても、勝手に面を替えない', () => {
    at(16, 59)
    const { rerender } = render(<TodayPlannerView />)
    at(17, 1)
    rerender(<TodayPlannerView />)
    expect(shownPane()).toBe('To do')
  })

  it('夜の通知から開くと、「やること」を選んでいてもその日のタイムライン', async () => {
    const user = userEvent.setup()
    at(21)
    render(<TodayPlannerView />)
    await user.click(screen.getByRole('tab', { name: 'To do' }))
    act(() => openWrapUpFromNotification())
    expect(shownPane()).toBe('Timeline')
  })

  it('夜の通知から開くと、まだ描いていなくてもタイムライン', () => {
    useTaskStore.getState().setPlannerDateKey(YESTERDAY)
    act(() => openWrapUpFromNotification())
    render(<TodayPlannerView />)
    expect(useTaskStore.getState().plannerDateKey).toBe(TODAY)
    expect(shownPane()).toBe('Timeline')
  })
})
