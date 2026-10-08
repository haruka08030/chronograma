import { render } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { fromDateKey } from '../lib/dateKey'
import { appTimeZone, instantFromWall } from '../lib/timeZone'
import { makeTask } from '../store/taskHelpers'
import { INBOX_LIST_ID } from '../store/storeConstants'
import type { Task } from '../types/task'
import type { CalendarEvent } from '../types/calendarEvent'
import { TodayPlannerView } from './TodayPlannerView'
import { WeekCalendarView } from './WeekCalendarView'

/**
 * 今日の計画の見出しの「予定 / 空き（超過）」と、週の見出しの「空き」は同じ計算（dayLoad.ts）。
 * 授業・バイト・Google の予定を引いた空きと、置いた To-Do の時間（時刻なしは見積もり）を比べる
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

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 8, 7, 0, 0))
  useTaskStore.getState().setSelectedCalendarDateKey(DAY)
  useTaskStore.setState({ dailyCapacityMinutes: 8 * 60 })
})

afterEach(() => {
  vi.useRealTimers()
})

let order = 0
function todo(id: string, over: Partial<Task> = {}): Task {
  return { ...makeTask({ title: id, listId: INBOX_LIST_ID, scheduledDate: DAY }, order++), id, ...over }
}

function event(id: string, startTime: string, endTime: string): Task {
  return { ...makeTask({ title: id, listId: INBOX_LIST_ID, kind: 'event', scheduledDate: DAY, startTime, endTime }, order++), id }
}

function googleEvent(startTime: string, endTime: string): CalendarEvent {
  const tz = appTimeZone()
  return {
    id: 'g1',
    summary: 'Meeting',
    start: new Date(instantFromWall(DAY, startTime, tz)).toISOString(),
    end: new Date(instantFromWall(DAY, endTime, tz)).toISOString(),
    startTime,
    endTime,
    date: DAY,
    isAllDay: false,
  }
}

function plannerLine(): HTMLElement {
  const { container, unmount } = render(<TodayPlannerView />)
  const line = container.querySelector<HTMLElement>('header [data-day-free]')!
  const snapshot = line.cloneNode(true) as HTMLElement
  unmount()
  return snapshot
}

function weekLine(): HTMLElement {
  const { container, unmount } = render(<WeekCalendarView anchor={fromDateKey(DAY)} selectedDateKey={DAY} threeDay />)
  const line = container.querySelector<HTMLElement>('[data-day-free]')!
  const snapshot = line.cloneNode(true) as HTMLElement
  unmount()
  return snapshot
}

describe('今日の計画の「予定 / 空き」', () => {
  it('授業とバイトのある日に、見積もりつきの To-Do を空きより多く置くと「超過」。週の見出しと同じ数字', () => {
    useTaskStore.setState({
      tasks: [
        // 授業 9〜13 時・バイト 17〜20 時（計 7 時間）→ 空き 1 時間
        event('class', '09:00', '13:00'),
        event('shift', '17:00', '20:00'),
        // 時刻なしの 2 件（見積もり 1 時間 + 30 分）。見積もりの無い行は数えない
        todo('report', { estimateMinutes: 60 }),
        todo('es', { estimateMinutes: 30 }),
        todo('mail'),
      ],
    })
    const planner = plannerLine()
    expect(planner).toHaveAttribute('data-day-free', 'over')
    expect(planner).toHaveTextContent('1h 30m planned / 1h free (over)')
    expect(planner).toHaveTextContent('To-Dos planned (1h 30m) are more than the free time (1h)')

    const week = weekLine()
    expect(week).toHaveAttribute('data-day-free', 'over')
    expect(week).toHaveTextContent('To-Dos placed on this day (1h 30m) are more than the free time (1h)')
  })

  it('予定の無い日は目安のまま。時刻つきは長さ、時刻なしは見積もりを足す', () => {
    useTaskStore.setState({
      tasks: [todo('timed', { startTime: '10:00', endTime: '12:00' }), todo('untimed', { estimateMinutes: 45 }), todo('noEstimate')],
    })
    const planner = plannerLine()
    expect(planner).toHaveAttribute('data-day-free', 'ok')
    expect(planner).toHaveTextContent('2h 45m planned / 8h free')
    expect(planner).not.toHaveTextContent('(over)')
    expect(weekLine()).toHaveTextContent('8h free this day')
  })

  it('Google の予定も空きから引く', () => {
    useTaskStore.getState().setCalendarEvents([googleEvent('13:00', '19:00')])
    useTaskStore.setState({ tasks: [todo('report', { estimateMinutes: 180 })] })
    const planner = plannerLine()
    expect(planner).toHaveAttribute('data-day-free', 'over')
    expect(planner).toHaveTextContent('3h planned / 2h free (over)')
    expect(weekLine()).toHaveTextContent('Free 2h / 3h')
  })

  it('過ぎた日は空きを出さず、予定の時間だけ', () => {
    useTaskStore.getState().setSelectedCalendarDateKey('2026-10-07')
    useTaskStore.setState({
      tasks: [{ ...todo('done', { estimateMinutes: 60 }), scheduledDate: '2026-10-07' }],
    })
    const { container } = render(<TodayPlannerView />)
    const header = container.querySelector('header')!
    expect(header).toHaveTextContent('1h planned')
    expect(header).not.toHaveTextContent('free')
    expect(header.querySelector('[data-day-free]')).toBeNull()
  })
})
