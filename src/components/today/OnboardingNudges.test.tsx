import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../../store/taskStore'
import { toDateKey } from '../../lib/dateKey'
import { appToday } from '../../lib/timeZone'
import { TodayPlannerView } from '../TodayPlannerView'
import { OnboardingNudges } from './OnboardingNudges'
import { ONBOARDING_DONE_MS } from './PlannerOnboarding'

const env = vi.hoisted(() => ({ ios: false, standalone: false }))
vi.mock('../../lib/pwa', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/pwa')>()),
  isIos: () => env.ios,
  isStandalone: () => env.standalone,
}))

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

beforeEach(() => {
  env.ios = true
  env.standalone = false
})

const installCard = () => screen.queryByRole('region', { name: 'Add to your Home Screen to get notifications' })

function completed() {
  useTaskStore.setState({ onboardingDone: true, onboardingCompleted: true })
}

describe('案内のあとのホーム画面への追加の誘い', () => {
  it('3 ステップをやり終えると、iPhone の Safari（未追加）でだけ出る', () => {
    vi.useFakeTimers()
    try {
      const id = useTaskStore.getState().addTask('Essay')!
      useTaskStore.getState().updateTask(id, { scheduledDate: toDateKey(appToday()), startTime: '15:00', endTime: '16:00' })
      useTaskStore.getState().setSelectedCalendarDateKey(toDateKey(appToday()))
      render(<TodayPlannerView />)
      expect(installCard()).toBeNull()
      act(() => useTaskStore.getState().startTimer('Essay', [], id))
      // 「できました」の間はまだ出さない
      expect(installCard()).toBeNull()
      act(() => vi.advanceTimersByTime(ONBOARDING_DONE_MS))
      expect(installCard()).toBeInTheDocument()
      expect(screen.getByText('Share button → “Add to Home Screen”')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('× で閉じたら二度と出ない', async () => {
    const user = userEvent.setup()
    completed()
    const { unmount } = render(<OnboardingNudges />)
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(installCard()).toBeNull()
    expect(useTaskStore.getState().installNudgeDismissed).toBe(true)
    unmount()
    render(<OnboardingNudges />)
    expect(installCard()).toBeNull()
  })

  it('案内を × で閉じた人・前から使っている人には出さない', () => {
    useTaskStore.setState({ onboardingDone: true, onboardingCompleted: false })
    render(<OnboardingNudges />)
    expect(installCard()).toBeNull()
  })

  it('ホーム画面から開いているときと、iPhone 以外では出さない', () => {
    completed()
    env.standalone = true
    const { unmount } = render(<OnboardingNudges />)
    expect(installCard()).toBeNull()
    unmount()
    env.ios = false
    env.standalone = false
    render(<OnboardingNudges />)
    expect(installCard()).toBeNull()
  })
})
