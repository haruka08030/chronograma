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

/** ログイン: 既定は Supabase なし（ログインの誘いは出ない） */
const auth = vi.hoisted(() => ({
  configured: false,
  user: null as { id: string; email: string } | null,
  loading: false,
  google: true,
  signInWithGoogle: vi.fn(async (): Promise<{ error?: string }> => ({})),
}))
vi.mock('../../lib/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/supabase')>()),
  get isSupabaseConfigured() {
    return auth.configured
  },
}))
vi.mock('../../lib/googleCalendar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/googleCalendar')>()),
  isGoogleAvailable: () => auth.google,
}))
vi.mock('../../contexts/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../contexts/AuthContext')>()
  return {
    ...actual,
    useAuth: () => ({ ...actual.useAuth(), user: auth.user, loading: auth.loading, signInWithGoogle: auth.signInWithGoogle }),
  }
})

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
  auth.configured = false
  auth.user = null
  auth.loading = false
  auth.google = true
  auth.signInWithGoogle.mockClear()
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

describe('案内のあとのログインの誘い（ログインしていない人）', () => {
  const card = () => screen.queryByRole('region', { name: 'Your to-dos and records are saved only in this browser' })
  const recordCard = () => screen.queryByRole('region', { name: /When a plan ends, get a notification/ })

  beforeEach(() => {
    env.ios = false
    auth.configured = true
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn(async () => 'granted') })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('3 ステップを終えると 1 回出て、押すと Google のログインに進む（押しただけでは閉じない）', async () => {
    const user = userEvent.setup()
    completed()
    render(<OnboardingNudges />)
    expect(card()).toBeInTheDocument()
    expect(screen.getByText(/Your phone or the Home Screen app will open empty/)).toBeInTheDocument()
    // 通知の誘いはログインの誘いのあと（一度に 1 つ）
    expect(recordCard()).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Sign in with Google' }))
    expect(auth.signInWithGoogle).toHaveBeenCalledOnce()
    expect(useTaskStore.getState().signInNudgeDismissed).toBe(false)
  })

  it('× で閉じたら二度と出ず、次の誘い（通知）に替わる', async () => {
    const user = userEvent.setup()
    completed()
    const { unmount } = render(<OnboardingNudges />)
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(card()).toBeNull()
    expect(useTaskStore.getState().signInNudgeDismissed).toBe(true)
    expect(recordCard()).toBeInTheDocument()
    unmount()
    render(<OnboardingNudges />)
    expect(card()).toBeNull()
  })

  it('ログイン中・ログインを確かめている間・Supabase が無いとき・3 ステップを終えていないときは出さない', () => {
    completed()
    auth.user = { id: 'u1', email: 'a@example.com' }
    const r1 = render(<OnboardingNudges />)
    expect(card()).toBeNull()
    r1.unmount()

    auth.user = null
    auth.loading = true
    const r2 = render(<OnboardingNudges />)
    expect(card()).toBeNull()
    r2.unmount()

    auth.loading = false
    auth.configured = false
    const r3 = render(<OnboardingNudges />)
    expect(card()).toBeNull()
    r3.unmount()

    auth.configured = true
    useTaskStore.setState({ onboardingCompleted: false })
    render(<OnboardingNudges />)
    expect(card()).toBeNull()
  })

  it('Google が使えなければ、設定のログインを開く', async () => {
    const user = userEvent.setup()
    auth.google = false
    completed()
    render(<OnboardingNudges />)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(auth.signInWithGoogle).not.toHaveBeenCalled()
    expect(useTaskStore.getState().settingsScrollTarget).toBe('account')
  })

  it('iPhone の Safari ではホーム画面への追加の誘いにログインのことを添え、別のカードは出さない', async () => {
    const user = userEvent.setup()
    env.ios = true
    completed()
    const r1 = render(<OnboardingNudges />)
    expect(installCard()).toBeInTheDocument()
    expect(screen.getByText('Sign in first and the Home Screen app will show the same data')).toBeInTheDocument()
    expect(card()).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Sign in with Google' }))
    expect(auth.signInWithGoogle).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(installCard()).toBeNull()
    expect(card()).toBeNull()
    r1.unmount()

    // ログイン中は添えない
    useTaskStore.setState({ installNudgeDismissed: false })
    auth.user = { id: 'u1', email: 'a@example.com' }
    render(<OnboardingNudges />)
    expect(installCard()).toBeInTheDocument()
    expect(screen.queryByText('Sign in first and the Home Screen app will show the same data')).toBeNull()
  })

  it('ログインの誘いを出している間は、今日の画面の下の通知の 1 行を出さない', () => {
    completed()
    const id = useTaskStore.getState().addTask('Essay')!
    useTaskStore.getState().updateTask(id, { scheduledDate: toDateKey(appToday()) })
    useTaskStore.getState().setSelectedCalendarDateKey(toDateKey(appToday()))
    render(<TodayPlannerView />)
    expect(card()).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Turn on$/ })).toBeNull()
  })
})
