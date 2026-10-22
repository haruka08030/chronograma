import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../../store/taskStore'
import { migrateTaskState } from '../../store/migrate'
import { toDateKey } from '../../lib/dateKey'
import { appToday } from '../../lib/timeZone'
import { TodayPlannerView } from '../TodayPlannerView'
import { ONBOARDING_DONE_MS } from './PlannerOnboarding'
import { GUIDE_PLACEHOLDER_MS } from './PlannerAddInput'

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
    expect(screen.getByRole('button', { name: 'Put “essay by tomorrow” in the add field' })).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('新しい人には追加欄を入口にし、案内は進み具合といまのステップの名前だけ', async () => {
    const user = userEvent.setup()
    openToday()
    expect(guide()).toHaveTextContent('Step 1 of 3: Add one thing to do')
    // 追加欄にはじめからカーソルがあり、薄い文字は書き方の例
    const input = screen.getByPlaceholderText('e.g. 3pm essay 1h')
    expect(input).toHaveFocus()

    // 例を押すと追加欄に入る（例のボタンは欄が空の間だけ）。Enter で足すと、時刻つきなので ① と ② が済む
    await user.click(screen.getByRole('button', { name: 'Put “3pm essay 1h” in the add field' }))
    expect(input).toHaveValue('3pm essay 1h')
    expect(input).toHaveFocus()
    expect(screen.queryByRole('button', { name: 'Put “essay by tomorrow” in the add field' })).toBeNull()
    await user.keyboard('{Enter}')
    expect(guide()).toHaveTextContent('Step 3 of 3: Press ▶ on the row when you start')
  })

  it('案内の間、追加欄の薄い文字の例は入れ替わる', () => {
    vi.useFakeTimers()
    try {
      openToday()
      expect(screen.getByPlaceholderText('e.g. 3pm essay 1h')).toBeInTheDocument()
      act(() => void vi.advanceTimersByTime(GUIDE_PLACEHOLDER_MS))
      expect(screen.getByPlaceholderText('e.g. essay by tomorrow')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('PC: 時間の決まっていない To-Do だけのとき、タイムラインの空きに「ここに置く」。押すと置け、② が済む', async () => {
    const original = window.matchMedia
    window.matchMedia = ((query: string) => ({
      matches: query.includes('min-width: 768px'),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    })) as unknown as typeof window.matchMedia
    // 夜遅くは今日の空きが無い。昼に固定する
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(new Date().setHours(13, 0, 0, 0)))
    try {
      const user = userEvent.setup()
      openToday()
      expect(screen.queryByRole('button', { name: /^Put “Essay” at/ })).toBeNull()
      await user.type(screen.getByPlaceholderText(/^e\.g\./), 'Essay{Enter}')
      const place = await screen.findByRole('button', { name: 'Put “Essay” at 13:00–14:00' })
      await user.click(place)
      const essay = useTaskStore.getState().tasks.find((x) => x.title === 'Essay')!
      expect(essay.startTime).toBeTruthy()
      expect(guide()).toHaveTextContent('Step 3 of 3')
      expect(screen.queryByRole('button', { name: /^Put “Essay” at/ })).toBeNull()
    } finally {
      window.matchMedia = original
      vi.useRealTimers()
    }
  })

  it('③ の間は行の ▶ を乗せなくても出しておく（場所を取って隠す印が付かない）', () => {
    const id = useTaskStore.getState().addTask('Essay')!
    useTaskStore.getState().updateTask(id, { scheduledDate: toDateKey(appToday()), startTime: '15:00', endTime: '16:00' })
    openToday()
    const play = screen.getAllByRole('button', { name: 'Start logging this task' })[0]!
    expect(play.className).not.toContain('group-hover/row:inline-flex')
    act(() => useTaskStore.getState().finishOnboarding())
    expect(screen.getAllByRole('button', { name: 'Start logging this task' })[0]!.className).toContain('group-hover/row:inline-flex')
  })

  it('案内を終えた日は睡眠の行を出さず、次の日から出す', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(new Date().setHours(13, 0, 0, 0)))
    try {
      const user = userEvent.setup()
      openToday()
      await user.click(screen.getByRole('button', { name: 'Close the guide' }))
      expect(screen.queryByText('Log your sleep?')).toBeNull()
      act(() => {
        useTaskStore.setState({ onboardingFinishedOn: '2000-01-01' })
      })
      expect(screen.getByText('Log your sleep?')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
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
      act(() => void vi.advanceTimersByTime(ONBOARDING_DONE_MS))
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
