import { render, screen } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { fromDateKey } from '../lib/dateKey'
import { HOUR_HEIGHT } from '../lib/timeGrid'
import { makeTask } from '../store/taskHelpers'
import { INBOX_LIST_ID } from '../store/storeConstants'
import { WeekCalendarView } from './WeekCalendarView'

beforeAll(() => {
  // jsdom には無いもの（タイムラインの大きさ・スクロール）
  Element.prototype.scrollIntoView = () => {}
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  vi.useFakeTimers({ toFake: ['Date'] })
  // 今日は 10/8。10/7 は過ぎた日
  vi.setSystemTime(new Date('2026-10-08T12:00:00'))
})
afterAll(() => {
  vi.useRealTimers()
})

function seed() {
  const todo = (title: string, scheduledDate: string, over = {}) => ({
    ...makeTask({ title, listId: INBOX_LIST_ID, scheduledDate, startTime: '13:00', endTime: '14:00' }, 0),
    ...over,
  })
  useTaskStore.setState({
    tasks: [
      {
        ...todo('レポート', '2026-10-09'),
        id: 'report',
        movedPlans: [{ date: '2026-10-07', startTime: '13:00', endTime: '14:00', to: '2026-10-09' }],
      },
      {
        ...todo('洗濯', '2026-10-07', { startTime: null, endTime: null }),
        id: 'laundry',
        completed: true,
        completedAt: '2026-10-07T01:00:00Z',
      },
      { ...todo('買い物', '2026-10-07', { startTime: null, endTime: null }), id: 'shop' },
    ],
  })
}

describe('WeekCalendarView: 移した予定の控え（#158）', () => {
  it('過ぎた日には元の時間に点線の枠で移した先（→10/9）を出し、予定の見出しを「予定 n・できた n・持ち越し n」にする', () => {
    seed()
    const { container } = render(<WeekCalendarView anchor={fromDateKey('2026-10-07')} selectedDateKey="2026-10-07" singleDay />)
    const ghost = container.querySelector<HTMLElement>('[data-datekey="2026-10-07"] [data-moved-plan]')!
    expect(ghost.textContent).toContain('レポート')
    expect(ghost.textContent).toContain('→Oct 9')
    expect(ghost.style.top).toBe(`${13 * HOUR_HEIGHT + 1}px`)
    expect(screen.getByText('Placed 3 · done 1 · moved 1')).toBeInTheDocument()
  })

  it('今日・これからの日には足さない', () => {
    seed()
    const { container } = render(<WeekCalendarView anchor={fromDateKey('2026-10-09')} selectedDateKey="2026-10-09" singleDay />)
    expect(container.querySelector('[data-moved-plan]')).toBeNull()
    expect(screen.queryByText(/moved/)).toBeNull()
    expect(screen.getByText('Plan')).toBeInTheDocument()
  })
})
