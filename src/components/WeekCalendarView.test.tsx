import { render } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { fromDateKey } from '../lib/dateKey'
import { HOUR_HEIGHT } from '../lib/timeGrid'
import { appTimeZone, instantFromWall } from '../lib/timeZone'
import type { CalendarEvent } from '../types/calendarEvent'
import { WeekCalendarView } from './WeekCalendarView'

beforeAll(() => {
  // jsdom には無いもの（タイムラインの大きさ・スクロール）
  Element.prototype.scrollIntoView = () => {}
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

/** 10/6 22:00〜10/7 2:00 の Google の予定 */
function nightEvent(): CalendarEvent {
  const tz = appTimeZone()
  return {
    id: 'night',
    summary: 'Night shift',
    start: new Date(instantFromWall('2026-10-06', '22:00', tz)).toISOString(),
    end: new Date(instantFromWall('2026-10-07', '02:00', tz)).toISOString(),
    startTime: '22:00',
    endTime: '02:00',
    date: '2026-10-06',
    isAllDay: false,
  }
}

function blockIn(container: HTMLElement, dateKey: string) {
  return container.querySelector<HTMLElement>(`[data-datekey="${dateKey}"] [data-block-id="event-night"]`)
}

describe('WeekCalendarView: 日をまたぐ Google の予定', () => {
  it('3 日表示では 10/6 に 22:00–24:00、10/7 に 0:00–2:00 のブロック', () => {
    useTaskStore.getState().setCalendarEvents([nightEvent()])
    const { container } = render(<WeekCalendarView anchor={fromDateKey('2026-10-06')} selectedDateKey="2026-10-06" threeDay />)
    const first = blockIn(container, '2026-10-06')!
    expect(first.style.top).toBe(`${22 * HOUR_HEIGHT}px`)
    expect(first.style.height).toBe(`${2 * HOUR_HEIGHT}px`)
    const next = blockIn(container, '2026-10-07')!
    expect(next.style.top).toBe('0px')
    expect(next.style.height).toBe(`${2 * HOUR_HEIGHT}px`)
    // 表示する時刻は予定全体
    expect(next.textContent).toContain('22:00 – 02:00')
    expect(blockIn(container, '2026-10-08')).toBeNull()
  })

  it('今日の計画（1 日表示）の翌日にも 0:00–2:00 で出る', () => {
    useTaskStore.getState().setCalendarEvents([nightEvent()])
    const { container } = render(<WeekCalendarView anchor={fromDateKey('2026-10-07')} selectedDateKey="2026-10-07" singleDay />)
    const block = blockIn(container, '2026-10-07')!
    expect(block.style.top).toBe('0px')
    expect(block.style.height).toBe(`${2 * HOUR_HEIGHT}px`)
  })
})
