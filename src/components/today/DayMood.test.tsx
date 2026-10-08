import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../../store/taskStore'
import { toDateKey } from '../../lib/dateKey'
import { appToday } from '../../lib/timeZone'
import { addDays } from 'date-fns'
import { TodayPlannerView } from '../TodayPlannerView'
import { DayMoodBadge, DayMoodPicker } from './DayMood'

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

const DAY = '2026-10-08'
const S = () => useTaskStore.getState()
const moods = () => within(screen.getByRole('group', { name: "Today's mood" })).getAllByRole('button')

beforeEach(() => {
  useTaskStore.setState({ dayMoods: {}, onboardingDone: true, tasks: [] })
})
afterEach(() => {
  vi.useRealTimers()
})

describe('気分の記号（#324）', () => {
  it('5 つの記号に名前があり、押すと付き・替わり・もう一度押すと外れる', async () => {
    const user = userEvent.setup()
    render(<DayMoodPicker dateKey={DAY} />)
    expect(moods().map((b) => b.getAttribute('aria-label'))).toEqual(['Very bad', 'Bad', 'Okay', 'Good', 'Very good'])
    expect(moods().every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true)
    // 一言の欄は記号を押すまで出さない
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Good' }))
    expect(S().dayMoods[DAY]?.mood).toBe(4)
    expect(screen.getByRole('button', { name: 'Good' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Bad' }))
    expect(S().dayMoods[DAY]?.mood).toBe(2)
    await user.click(screen.getByRole('button', { name: 'Bad' }))
    expect(S().dayMoods[DAY]?.mood).toBeNull()
  })

  it('一言は Enter・離れたときに残し、Esc で書く前に戻す', async () => {
    const user = userEvent.setup()
    render(<DayMoodPicker dateKey={DAY} />)
    await user.click(screen.getByRole('button', { name: 'Okay' }))
    const note = screen.getByRole('textbox', { name: 'A short note' })
    await user.type(note, 'slept well{Enter}')
    expect(S().dayMoods[DAY]?.note).toBe('slept well')

    await user.clear(note)
    await user.type(note, 'oops{Escape}')
    expect(note).toHaveValue('slept well')
    expect(S().dayMoods[DAY]?.note).toBe('slept well')

    await user.clear(note)
    await user.tab()
    expect(S().dayMoods[DAY]?.note).toBe('')
  })

  it('過ぎた日の見出しには記号を小さく出し、一言があれば押すと開く', async () => {
    const user = userEvent.setup()
    useTaskStore.setState({ dayMoods: { [DAY]: { mood: 5, note: 'great day', updatedAt: 'x', syncedAt: null } } })
    render(<DayMoodBadge dateKey={DAY} />)
    const badge = screen.getByRole('button', { name: 'Mood: Very good' })
    expect(screen.queryByText('great day')).not.toBeInTheDocument()
    await user.click(badge)
    expect(badge).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('great day')).toBeInTheDocument()
  })

  it('一言の無い日は押せない記号だけ、選んでいない日は何も出さない', () => {
    useTaskStore.setState({ dayMoods: { [DAY]: { mood: 1, note: '', updatedAt: 'x', syncedAt: null } } })
    const { unmount } = render(<DayMoodBadge dateKey={DAY} />)
    expect(screen.getByRole('img', { name: 'Mood: Very bad' })).toBeInTheDocument()
    unmount()
    useTaskStore.setState({ dayMoods: { [DAY]: { mood: null, note: 'x', updatedAt: 'x', syncedAt: null } } })
    const { container } = render(<DayMoodBadge dateKey={DAY} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('今日の計画での出し方', () => {
  function openDay(key: string) {
    S().setSelectedCalendarDateKey(key)
    return render(<TodayPlannerView />)
  }

  it('今日の締めの時刻（既定 17 時）からは、To-Do が無い日も記号の行を出す。昼は出さない', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(new Date().setHours(13, 0, 0, 0)))
    const { unmount } = openDay(toDateKey(appToday()))
    expect(screen.queryByRole('group', { name: "Today's mood" })).not.toBeInTheDocument()
    unmount()
    vi.setSystemTime(new Date(new Date().setHours(21, 30, 0, 0)))
    openDay(toDateKey(appToday()))
    expect(screen.getByRole('group', { name: "Today's mood" })).toBeInTheDocument()
  })

  it('過ぎた日は見出しに付けた記号が出て、締めの記号の行は出さない', () => {
    const yesterday = toDateKey(addDays(appToday(), -1))
    useTaskStore.setState({ dayMoods: { [yesterday]: { mood: 3, note: '', updatedAt: 'x', syncedAt: null } } })
    openDay(yesterday)
    expect(screen.getByRole('img', { name: 'Mood: Okay' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: "Today's mood" })).not.toBeInTheDocument()
  })
})
