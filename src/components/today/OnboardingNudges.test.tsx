import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
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

describe('案内のあとの通知の誘い（予定のあとの確認）', () => {
  const card = () => screen.queryByRole('region', { name: /When a plan ends, get a notification/ })
  const notification = { permission: 'default' as NotificationPermission, requestPermission: vi.fn(async () => 'granted' as const) }

  beforeEach(() => {
    env.ios = false
    notification.permission = 'default'
    notification.requestPermission.mockClear()
    vi.stubGlobal('Notification', notification)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('押すと通知の許可を聞き、予定のあとの確認をオンにして閉じる', async () => {
    const user = userEvent.setup()
    completed()
    render(<OnboardingNudges />)
    await user.click(screen.getByRole('button', { name: 'Turn on notifications' }))
    expect(notification.requestPermission).toHaveBeenCalledOnce()
    expect(useTaskStore.getState().recordPrompts).toBe(true)
    expect(card()).toBeNull()
  })

  it('許可されなければオンにせず、もう出さない', async () => {
    notification.requestPermission.mockResolvedValueOnce('denied' as never)
    const user = userEvent.setup()
    completed()
    render(<OnboardingNudges />)
    await user.click(screen.getByRole('button', { name: 'Turn on notifications' }))
    expect(useTaskStore.getState().recordPrompts).toBe(false)
    expect(card()).toBeNull()
  })

  it('× で閉じたら二度と出ない', async () => {
    const user = userEvent.setup()
    completed()
    render(<OnboardingNudges />)
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(card()).toBeNull()
    expect(useTaskStore.getState().reminderPromptDismissed).toBe(true)
  })

  it('もうオン・断られている・通知が使えない環境では出さない', () => {
    completed()
    useTaskStore.setState({ recordPrompts: true })
    const r1 = render(<OnboardingNudges />)
    expect(card()).toBeNull()
    r1.unmount()

    useTaskStore.setState({ recordPrompts: false })
    notification.permission = 'denied'
    const r2 = render(<OnboardingNudges />)
    expect(card()).toBeNull()
    r2.unmount()

    vi.unstubAllGlobals()
    render(<OnboardingNudges />)
    expect(card()).toBeNull()
  })

  it('iPhone の Safari（未追加）ではホーム画面への追加だけを出し、追加して開いたら通知の誘いを出す', () => {
    env.ios = true
    completed()
    const r1 = render(<OnboardingNudges />)
    expect(installCard()).toBeInTheDocument()
    expect(card()).toBeNull()
    r1.unmount()

    // ホーム画面のアプリは保存先が別。初めての同期で案内が済んだ扱いになった状態でも出す
    env.standalone = true
    useTaskStore.setState({ onboardingDone: true, onboardingCompleted: false })
    render(<OnboardingNudges />)
    expect(installCard()).toBeNull()
    expect(card()).toBeInTheDocument()
  })

  it('案内のあとのカードを出している間は、今日の画面の下の通知の 1 行を出さない', () => {
    completed()
    const id = useTaskStore.getState().addTask('Essay')!
    useTaskStore.getState().updateTask(id, { scheduledDate: toDateKey(appToday()) })
    useTaskStore.getState().setSelectedCalendarDateKey(toDateKey(appToday()))
    const { unmount } = render(<TodayPlannerView />)
    expect(card()).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Turn on$/ })).toBeNull()
    unmount()
    // 案内を × で閉じた人には今までどおり下の 1 行
    useTaskStore.setState({ onboardingCompleted: false })
    render(<TodayPlannerView />)
    expect(card()).toBeNull()
    expect(screen.getByRole('button', { name: /^Turn on$/ })).toBeInTheDocument()
  })
})
