import { render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { fromDateKey } from '../lib/dateKey'
import { HOUR_HEIGHT } from '../lib/timeGrid'
import { appTimeZone, instantFromWall } from '../lib/timeZone'
import { makeTask } from '../store/taskHelpers'
import { INBOX_LIST_ID } from '../store/storeConstants'
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

describe('WeekCalendarView: 重なった予定の横幅', () => {
  const originalMatchMedia = window.matchMedia
  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  /** 10/7 のバイト 18:00–21:00 と ES を書く 20:00–21:00（記録は無し） */
  function seedOverlap() {
    const at = (title: string, startTime: string, endTime: string, order: number) =>
      makeTask({ title, listId: INBOX_LIST_ID, scheduledDate: '2026-10-07', startTime, endTime }, order)
    useTaskStore.setState({
      tasks: [
        { ...at('バイト', '18:00', '21:00', 0), id: 'shift' },
        { ...at('ES を書く', '20:00', '21:00', 1), id: 'es' },
      ],
    })
  }

  function planBlock(container: HTMLElement, id: string) {
    return container.querySelector<HTMLElement>(`[data-datekey="2026-10-07"] [data-block-id="${id}"]`)!
  }

  it('PC の週表示では記録の無い時間帯の予定が列の全幅を使う（半分に分けない）', () => {
    // PC 幅（7 日の列を並べる）
    window.matchMedia = ((query: string) => ({
      matches: query.includes('min-width: 768px'),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    })) as unknown as typeof window.matchMedia
    seedOverlap()
    const { container } = render(<WeekCalendarView anchor={fromDateKey('2026-10-07')} selectedDateKey="2026-10-07" />)
    expect(container.querySelectorAll('[data-datekey]').length).toBe(7)
    expect(planBlock(container, 'shift').style.width).toBe('calc(100% - 4px)')
    expect(planBlock(container, 'es').style.left).toBe('calc(0% + 16px)')
    expect(planBlock(container, 'es').style.width).toBe('calc(100% - 18px)')
  })

  it('今日の計画（1 日表示）は 予定 / 記録 の 2 列のまま', () => {
    seedOverlap()
    const { container } = render(<WeekCalendarView anchor={fromDateKey('2026-10-07')} selectedDateKey="2026-10-07" singleDay />)
    expect(planBlock(container, 'shift').style.width).toBe('calc(25% - 4px)')
    expect(planBlock(container, 'es').style.left).toBe('calc(25% + 2px)')
    // 文字は上端に寄せる（長いバイトに後の予定が重なっても題名が隠れない）
    expect(planBlock(container, 'shift').className).toContain('flex-col justify-start')
  })

  it('狭いカードは「タイトル、開始」を 1 行に並べ（入らなければ時刻ごと次の行へ）、時刻は折り返さない', () => {
    seedOverlap()
    const { container } = render(<WeekCalendarView anchor={fromDateKey('2026-10-07')} selectedDateKey="2026-10-07" singleDay />)
    const body = planBlock(container, 'es').firstElementChild as HTMLElement
    expect(body.className).toContain('@max-[5rem]:flex-wrap')
    const [title, time] = Array.from(body.children) as HTMLElement[]
    // 狭いときだけ区切り（テストは英語なので「, 」）を出し、終了時刻は隠す
    expect(title!.textContent).toBe('ES を書く, ')
    expect(title!.lastElementChild!.className).toContain('hidden @max-[5rem]:inline')
    expect(time!.className).toContain('truncate')
    expect(time!.textContent).toBe('20:00 – 21:00')
    expect(time!.lastElementChild!.className).toContain('@max-[5rem]:hidden')
  })
})
