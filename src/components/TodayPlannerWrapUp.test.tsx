import { act, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { makeTask } from '../store/taskHelpers'
import { INBOX_LIST_ID } from '../store/storeConstants'
import type { Task } from '../types/task'
import { openWrapUpFromNotification } from '../lib/notificationLaunch'
import { TodayPlannerView } from './TodayPlannerView'

/**
 * 今日の計画の「1 日を締める」（#299）: 出し始める時刻は設定の夜の締めの時刻（未設定なら 17 時）。
 * 夜の締めの通知から開くと、時刻に関係なく出してそこまでスクロールする
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

const DAY = '2026-10-08'
const REMAINING = '2 left.'

let order = 0
function todo(id: string, over: Partial<Task> = {}): Task {
  return { ...makeTask({ title: id, listId: INBOX_LIST_ID, scheduledDate: DAY }, order++), id, ...over }
}

function at(hour: number, minute = 0) {
  vi.setSystemTime(new Date(2026, 9, 8, hour, minute, 0))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  at(10)
  useTaskStore.getState().setSelectedCalendarDateKey(DAY)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('「1 日を締める」を出す時刻', () => {
  it('夜の締めの時刻が無ければ今までどおり 17 時から', () => {
    useTaskStore.setState({ tasks: [todo('a'), todo('b')] })
    at(16, 59)
    const { unmount } = render(<TodayPlannerView />)
    expect(screen.queryByText(REMAINING)).toBeNull()
    unmount()
    at(17)
    render(<TodayPlannerView />)
    expect(screen.getByText(REMAINING)).toBeInTheDocument()
  })

  it('夜の締めの時刻を決めていれば、その時刻から', () => {
    useTaskStore.setState({ tasks: [todo('a'), todo('b')], dailyReminders: { planTime: null, wrapUpTime: '21:30' } })
    at(21, 29)
    const { unmount } = render(<TodayPlannerView />)
    expect(screen.queryByText(REMAINING)).toBeNull()
    unmount()
    at(21, 30)
    render(<TodayPlannerView />)
    expect(screen.getByText(REMAINING)).toBeInTheDocument()
  })
})

describe('夜の締めの通知から開いたとき', () => {
  it('時刻の前でも「1 日を締める」を出し、そこまでスクロールする', () => {
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView')
    useTaskStore.setState({ tasks: [todo('a'), todo('b')], dailyReminders: { planTime: null, wrapUpTime: '22:00' } })
    render(<TodayPlannerView />)
    expect(screen.queryByText(REMAINING)).toBeNull()
    act(() => openWrapUpFromNotification())
    expect(screen.getByText(REMAINING)).toBeInTheDocument()
    const footer = document.querySelector('[data-wrap-up]') as HTMLElement
    expect(within(footer).getByRole('button', { name: 'Move to tomorrow' })).toBeInTheDocument()
    expect(scroll.mock.contexts).toContain(footer)
  })

  it('通知を押してから今日の計画を描いても受け取る（起動したとき）', () => {
    useTaskStore.setState({ tasks: [todo('a'), todo('b')] })
    useTaskStore.getState().setSelectedCalendarDateKey('2026-10-01')
    openWrapUpFromNotification()
    expect(useTaskStore.getState().selectedView).toBe('planner')
    // 見ている日は今日に戻る
    expect(useTaskStore.getState().selectedCalendarDateKey).toBe(DAY)
    render(<TodayPlannerView />)
    expect(screen.getByText(REMAINING)).toBeInTheDocument()
  })

  it('することが残っていなければ、締めはできていると書く', () => {
    useTaskStore.setState({ tasks: [todo('a', { completed: true, completedAt: new Date(2026, 9, 8, 9).toISOString() })] })
    render(<TodayPlannerView />)
    act(() => openWrapUpFromNotification())
    expect(screen.getByText('Today is wrapped up.')).toBeInTheDocument()
  })
})
