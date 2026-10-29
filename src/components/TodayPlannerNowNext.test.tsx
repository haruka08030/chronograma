import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { makeTask } from '../store/taskHelpers'
import { INBOX_LIST_ID } from '../store/storeConstants'
import type { Task } from '../types/task'
import type { CalendarEvent } from '../types/calendarEvent'
import { TodayPlannerView } from './TodayPlannerView'

/** スマホの今日やる行の一番上の「今」「次」（#369・#400）: 下の時間を決めた行と重ねない・予定も入れる */

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

let order = 0
function todo(id: string, over: Partial<Task> = {}): Task {
  return { ...makeTask({ title: id, listId: INBOX_LIST_ID, scheduledDate: DAY }, order++), id, ...over }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 8, 10, 0, 0))
  useTaskStore.getState().setPlannerDateKey(DAY)
  useTaskStore.setState({ calendarEvents: [] })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const optionNames = () =>
  within(screen.getByRole('listbox'))
    .getAllByRole('option')
    .map((o) => o.textContent ?? '')
const nowNextGroup = () => screen.getByRole('group', { name: 'Now and next' })

describe('スマホの「今」「次」', () => {
  it('一番上に出した To-Do は下の時間を決めた行から外し、キーの並びでも先頭', async () => {
    useTaskStore.setState({
      tasks: [
        todo('later', { startTime: '13:00', endTime: '14:00' }),
        todo('current', { startTime: '09:30', endTime: '10:30' }),
        todo('someday'),
      ],
    })
    render(<TodayPlannerView />)
    expect(within(nowNextGroup()).getByText('current')).toBeInTheDocument()
    expect(within(nowNextGroup()).getByText('Now')).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Scheduled' })).queryByText('current')).toBeNull()
    expect(optionNames().map((x) => x.match(/current|someday|later/)?.[0])).toEqual(['current', 'someday', 'later'])

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await user.keyboard('{ArrowDown}')
    const list = screen.getByRole('listbox')
    expect(document.getElementById(list.getAttribute('aria-activedescendant')!)?.textContent).toContain('current')
  })

  it('予定（授業）が今なら予定の行。✓ は無く、押すと予定のカード。To-Do は下の行に残る', async () => {
    useTaskStore.setState({
      tasks: [
        todo('Lecture', { kind: 'event', startTime: '09:00', endTime: '10:30' }),
        todo('essay', { startTime: '13:00', endTime: '14:00' }),
      ],
    })
    render(<TodayPlannerView />)
    const group = nowNextGroup()
    expect(within(group).getByText('Lecture')).toBeInTheDocument()
    expect(within(group).queryByRole('checkbox')).toBeNull()
    expect(within(screen.getByRole('group', { name: 'Scheduled' })).getByText('essay')).toBeInTheDocument()

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await user.click(within(group).getByRole('button', { name: /Lecture/ }))
    expect(await screen.findByRole('dialog', { name: 'Lecture' })).toBeInTheDocument()
  })

  it('Google の予定も入る。To-Do が今なら To-Do を先に', () => {
    const event: CalendarEvent = {
      id: 'g1',
      summary: 'Seminar',
      start: '2026-10-08T11:00:00+09:00',
      end: '2026-10-08T12:00:00+09:00',
      startTime: '11:00',
      endTime: '12:00',
      date: DAY,
      isAllDay: false,
    }
    useTaskStore.setState({ tasks: [todo('essay', { startTime: '13:00', endTime: '14:00' })], calendarEvents: [event] })
    const { unmount } = render(<TodayPlannerView />)
    expect(within(nowNextGroup()).getByText('Seminar')).toBeInTheDocument()
    expect(within(nowNextGroup()).getByText('Next')).toBeInTheDocument()
    unmount()

    useTaskStore.setState({ tasks: [todo('essay', { startTime: '09:45', endTime: '10:15' })], calendarEvents: [event] })
    render(<TodayPlannerView />)
    expect(within(nowNextGroup()).getByText('essay')).toBeInTheDocument()
  })

  it('PC は出さず、時間を決めた行はそのまま', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('min-width'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    useTaskStore.setState({ tasks: [todo('current', { startTime: '09:30', endTime: '10:30' })] })
    render(<TodayPlannerView />)
    expect(screen.queryByRole('group', { name: 'Now and next' })).toBeNull()
    expect(within(screen.getByRole('group', { name: 'Scheduled' })).getByText('current')).toBeInTheDocument()
  })
})
