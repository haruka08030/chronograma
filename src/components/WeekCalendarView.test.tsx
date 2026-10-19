import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { fromDateKey } from '../lib/dateKey'
import { HOUR_HEIGHT } from '../lib/timeGrid'
import { appTimeZone, instantFromWall } from '../lib/timeZone'
import { makeTask } from '../store/taskHelpers'
import { INBOX_LIST_ID } from '../store/storeConstants'
import type { CalendarEvent } from '../types/calendarEvent'
import { WeekCalendarView } from './WeekCalendarView'
import { focusQuickAdd, hasQuickAddTarget } from '../lib/quickAddFocus'

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
    vi.useRealTimers()
  })

  /** PC 幅（7 日の列を並べる） */
  function desktop() {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('min-width: 768px'),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    })) as unknown as typeof window.matchMedia
  }

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

  it('PC の週表示も過ぎた時間の記録の無い時間帯の予定は左半分に収める（全幅に広げない）', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(instantFromWall('2026-10-08', '12:00', appTimeZone()))
    desktop()
    seedOverlap()
    const { container } = render(<WeekCalendarView anchor={fromDateKey('2026-10-07')} selectedDateKey="2026-10-07" />)
    expect(container.querySelectorAll('[data-datekey]').length).toBe(7)
    expect(planBlock(container, 'shift').style.width).toBe('calc(50% - 4px)')
    expect(planBlock(container, 'es').style.left).toBe('calc(0% + 16px)')
    expect(planBlock(container, 'es').style.width).toBe('calc(50% - 18px)')
  })

  it('カレンダーの未来（今より先）は記録を置けないので予定が全幅', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(instantFromWall('2026-10-07', '16:00', appTimeZone()))
    desktop()
    seedOverlap()
    const { container } = render(<WeekCalendarView anchor={fromDateKey('2026-10-07')} selectedDateKey="2026-10-07" />)
    expect(planBlock(container, 'shift').style.width).toBe('calc(100% - 4px)')
    expect(planBlock(container, 'es').style.width).toBe('calc(100% - 18px)')
  })

  it('カレンダーで予定どおりの記録があれば、予定は出さず記録が全幅', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(instantFromWall('2026-10-08', '12:00', appTimeZone()))
    desktop()
    useTaskStore.setState({
      tasks: [
        {
          ...makeTask({ title: 'ゼミ', listId: INBOX_LIST_ID, scheduledDate: '2026-10-07', startTime: '15:00', endTime: '16:30' }, 0),
          id: 'seminar',
        },
      ],
    })
    useTaskStore.getState().addTimeLog('ゼミ', '2026-10-07', '15:05', '16:30', [])
    const log = useTaskStore.getState().tasks.find((x) => x.title === 'ゼミ' && x.id !== 'seminar')!
    const { container } = render(<WeekCalendarView anchor={fromDateKey('2026-10-07')} selectedDateKey="2026-10-07" />)
    expect(container.querySelector('[data-datekey="2026-10-07"] [data-block-id="seminar"]')).toBeNull()
    expect(planBlock(container, log.id).style.width).toBe('calc(100% - 4px)')
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

describe('WeekCalendarView: キーでブロックを動かす（Alt+↑↓ / Alt+Shift+↑↓）', () => {
  function seedPlan() {
    useTaskStore.setState({
      tasks: [
        {
          ...makeTask({ title: '読書', listId: INBOX_LIST_ID, scheduledDate: '2026-10-07', startTime: '10:00', endTime: '11:00' }, 0),
          id: 'p',
        },
      ],
    })
  }
  const plan = () => useTaskStore.getState().tasks.find((x) => x.id === 'p')!
  function renderFocused() {
    seedPlan()
    const view = render(<WeekCalendarView anchor={fromDateKey('2026-10-07')} selectedDateKey="2026-10-07" singleDay />)
    const block = view.container.querySelector<HTMLElement>('[data-block-id="p"]')!
    block.focus()
    return { ...view, block }
  }

  it('フォーカスしたブロックが Alt+↓ で 15 分後、Alt+↑ で 15 分前へ。Option の Mac でも矢印の key で合う', () => {
    const { block } = renderFocused()
    fireEvent.keyDown(block, { key: 'ArrowDown', code: 'ArrowDown', altKey: true })
    expect(plan()).toMatchObject({ startTime: '10:15', endTime: '11:15' })
    fireEvent.keyDown(block, { key: 'ArrowUp', code: 'ArrowUp', altKey: true })
    fireEvent.keyDown(block, { key: 'ArrowUp', code: 'ArrowUp', altKey: true })
    expect(plan()).toMatchObject({ startTime: '09:45', endTime: '10:45' })
  })

  it('Alt+Shift+↓ で終わりだけ 15 分伸びる。動かしたあとも同じブロックにフォーカスがあり、新しい時刻を読み上げる', async () => {
    const { block } = renderFocused()
    fireEvent.keyDown(block, { key: 'ArrowDown', altKey: true, shiftKey: true })
    expect(plan()).toMatchObject({ startTime: '10:00', endTime: '11:15' })
    await waitFor(() => expect(document.querySelector('[data-testid="live-announcer"]')?.textContent).toBe('“読書” 10:00–11:15'))
    await waitFor(() => expect((document.activeElement as HTMLElement).dataset.blockId).toBe('p'))
  })

  it('修飾キーの無い矢印・入力中・日本語の変換中は動かさない', () => {
    const { block, container } = renderFocused()
    fireEvent.keyDown(block, { key: 'ArrowDown' })
    fireEvent.keyDown(block, { key: 'ArrowDown', altKey: true, isComposing: true })
    fireEvent.keyDown(block, { key: 'ArrowDown', altKey: true, keyCode: 229 })
    const input = document.createElement('input')
    container.appendChild(input)
    input.focus()
    fireEvent.keyDown(input, { key: 'ArrowDown', altKey: true })
    expect(plan()).toMatchObject({ startTime: '10:00', endTime: '11:00' })
  })

  it('ブロックにフォーカスが無ければ何もしない', () => {
    seedPlan()
    render(<WeekCalendarView anchor={fromDateKey('2026-10-07')} selectedDateKey="2026-10-07" singleDay />)
    fireEvent.keyDown(document.body, { key: 'ArrowDown', altKey: true })
    expect(plan()).toMatchObject({ startTime: '10:00', endTime: '11:00' })
  })
})

describe('WeekCalendarView: 見出しの空き時間', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('今日から先の日に空きを出し、置いた To-Do が空きを超える日は置いた時間も足して知らせる', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 7, 8, 0, 0))
    useTaskStore.setState({
      dailyCapacityMinutes: 8 * 60,
      tasks: [
        // 10/8: 授業 9〜16 時（7 時間）→ 空き 1 時間に、見積もり 4 時間のレポート
        {
          ...makeTask(
            { title: '授業', listId: INBOX_LIST_ID, kind: 'event', scheduledDate: '2026-10-08', startTime: '09:00', endTime: '16:00' },
            0,
          ),
          id: 'class',
        },
        { ...makeTask({ title: 'レポート', listId: INBOX_LIST_ID, scheduledDate: '2026-10-08' }, 1), id: 'report', estimateMinutes: 240 },
      ],
    })
    const { container } = render(<WeekCalendarView anchor={fromDateKey('2026-10-06')} selectedDateKey="2026-10-07" threeDay />)
    const lines = [...container.querySelectorAll<HTMLElement>('[data-day-free]')]
    // 10/6 は過ぎた日なので出さない
    expect(lines).toHaveLength(2)
    expect(lines[0]).toHaveAttribute('data-day-free', 'ok')
    expect(lines[0]).toHaveTextContent('Free 8h')
    expect(lines[1]).toHaveAttribute('data-day-free', 'over')
    expect(lines[1]).toHaveTextContent('Free 1h / 4h')
    // 色だけでなく、読み上げでも分かる
    expect(lines[1]).toHaveTextContent('To-Dos placed on this day (4h) are more than the free time (1h)')
  })
})

describe('WeekCalendarView: 記録の無い時間（点線の枠）', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  /** 今は 10/7 16:00。10/6 23:30〜10/7 7:00 に寝て、9:00–10:00 と 11:00–11:20 に記録 */
  function seedDay() {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(instantFromWall('2026-10-07', '16:00', appTimeZone()))
    const s = useTaskStore.getState()
    s.logSleep('2026-10-07', '23:30', '07:00')
    s.addTimeLog('Reading', '2026-10-07', '09:00', '10:00', [])
    s.addTimeLog('Mail', '2026-10-07', '11:00', '11:20', [])
  }

  const gapsIn = (container: HTMLElement, dateKey: string) =>
    Array.from(container.querySelectorAll<HTMLElement>(`[data-datekey="${dateKey}"] [data-unrecorded-gap]`))

  it('今日は起きてから今までの 30 分以上の抜けを、記録の列に点線の枠で出す（今より先には出さない）', () => {
    seedDay()
    const { container } = render(<WeekCalendarView anchor={fromDateKey('2026-10-07')} selectedDateKey="2026-10-07" singleDay />)
    const gaps = gapsIn(container, '2026-10-07')
    // 7:00–9:00、10:00–11:00、11:20–16:00（今まで）
    expect(gaps.map((g) => g.getAttribute('aria-label'))).toEqual([
      'Unrecorded 07:00–09:00 (click to record this time)',
      'Unrecorded 10:00–11:00 (click to record this time)',
      'Unrecorded 11:20–16:00 (click to record this time)',
    ])
    expect(gaps[0]!.style.top).toBe(`${7 * HOUR_HEIGHT + 1}px`)
    expect(gaps[0]!.style.height).toBe(`${2 * HOUR_HEIGHT - 2}px`)
    // 記録の列（右半分）。点線の枠で、塗らない
    expect(gaps[0]!.style.left).toBe('calc(50% + 2px)')
    expect(gaps[0]!.className).toContain('border-dashed')
    expect(gaps[0]!.className).not.toContain('gc-plan')
    expect(gaps[1]!.textContent).toBe('+ 1h unrecorded')
  })

  it('押すと、その時間のままの後から記録のカードが開き、保存すると記録になる', async () => {
    seedDay()
    const { container } = render(<WeekCalendarView anchor={fromDateKey('2026-10-07')} selectedDateKey="2026-10-07" singleDay />)
    const gap = gapsIn(container, '2026-10-07')[1]!
    fireEvent.pointerDown(gap)
    fireEvent.click(gap)
    const input = await screen.findByPlaceholderText('What did you do?')
    fireEvent.change(input, { target: { value: 'Commute' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    const created = useTaskStore.getState().tasks.find((t) => t.title === 'Commute')
    expect(created).toMatchObject({ kind: 'log', dueDate: '2026-10-07', startTime: '10:00', endTime: '11:00' })
    // 埋めた所の枠は消える
    await waitFor(() => expect(gapsIn(container, '2026-10-07')).toHaveLength(2))
  })

  it('先の日と、記録の列の無い 3 日表示には出さない', () => {
    seedDay()
    const s = useTaskStore.getState()
    s.addTimeLog('Future', '2026-10-08', '09:00', '10:00', [])
    s.addTimeLog('Future2', '2026-10-08', '14:00', '15:00', [])
    const three = render(<WeekCalendarView anchor={fromDateKey('2026-10-07')} selectedDateKey="2026-10-07" threeDay />)
    expect(three.container.querySelectorAll('[data-unrecorded-gap]')).toHaveLength(0)
    three.unmount()
    const next = render(<WeekCalendarView anchor={fromDateKey('2026-10-08')} selectedDateKey="2026-10-08" singleDay />)
    expect(gapsIn(next.container, '2026-10-08')).toHaveLength(0)
  })
})

describe('WeekCalendarView: C で作成カード', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('選んでいる日の次の正時で作成カードが開き、そのまま入れるとその時間の予定になる', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(instantFromWall('2026-10-07', '16:20', appTimeZone()))
    useTaskStore.setState({ tasks: [], defaultBlockMinutes: 60 })
    render(<WeekCalendarView anchor={fromDateKey('2026-10-07')} selectedDateKey="2026-10-08" threeDay />)
    act(() => {
      expect(focusQuickAdd()).toBe(true)
    })
    const input = await screen.findByPlaceholderText('Add title')
    fireEvent.change(input, { target: { value: 'Seminar' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(useTaskStore.getState().tasks.find((t) => t.title === 'Seminar')).toMatchObject({
      scheduledDate: '2026-10-08',
      startTime: '17:00',
      endTime: '18:00',
    })
  })

  it('今日の計画（1 日表示）では登録しない（今日の追加欄へ）', () => {
    render(<WeekCalendarView anchor={fromDateKey('2026-10-07')} selectedDateKey="2026-10-07" singleDay />)
    expect(hasQuickAddTarget()).toBe(false)
  })
})

describe('WeekCalendarView: 習慣の枠', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  /** 今は 10/7 16:00。毎日 7:00–7:30 の Run（10/7 は始まっている） */
  function seedHabit() {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(instantFromWall('2026-10-07', '16:00', appTimeZone()))
    useTaskStore.setState({ habits: [], tasks: [] })
    const id = useTaskStore.getState().addHabit({
      title: 'Run',
      color: '#0B8043',
      timeMode: 'range',
      startTime: '07:00',
      endTime: '07:30',
      frequency: { type: 'daily' },
      weekdayTimes: undefined,
      goalMinutes: undefined,
    })
    const view = render(<WeekCalendarView anchor={fromDateKey('2026-10-07')} selectedDateKey="2026-10-07" threeDay />)
    const block = () => view.container.querySelector<HTMLElement>(`[data-datekey="2026-10-07"] [data-block-id^="habit-slot::"]`)!
    return { id, block }
  }

  it('押すと小さなカードが開き、✓ で予定どおり達成になる', async () => {
    const { id, block } = seedHabit()
    fireEvent.keyDown(block(), { key: 'Enter' })
    const card = await screen.findByRole('dialog', { name: 'Run' })
    fireEvent.click(within(card).getByRole('button', { name: 'Done as planned (log it)' }))
    expect(useTaskStore.getState().tasks.some((t) => t.habitId === id && t.startTime === '07:00')).toBe(true)
    // 済んだ枠も押すとカード（取り消しが出る）
    fireEvent.click(block())
    const again = await screen.findByRole('dialog', { name: 'Run' })
    expect(within(again).getByRole('button', { name: 'Mark as not done' })).toBeInTheDocument()
  })

  it('右クリックで習慣のメニュー', () => {
    const { block } = seedHabit()
    fireEvent.contextMenu(block(), { clientX: 100, clientY: 100 })
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('時刻ひとつの習慣は格子に置かず、習慣の段に時刻つきで出す', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(instantFromWall('2026-10-07', '16:00', appTimeZone()))
    useTaskStore.setState({ habits: [], tasks: [] })
    const id = useTaskStore.getState().addHabit({
      title: 'Stretch',
      color: '#0B8043',
      timeMode: 'fixed',
      startTime: '07:00',
      endTime: null,
      frequency: { type: 'daily' },
      weekdayTimes: undefined,
      goalMinutes: undefined,
    })
    const view = render(<WeekCalendarView anchor={fromDateKey('2026-10-07')} selectedDateKey="2026-10-07" threeDay />)
    expect(view.container.querySelector('[data-datekey] [data-block-id^="habit-slot::"]')).toBeNull()
    expect(screen.getByText('Habits')).toBeInTheDocument()
    expect(screen.getAllByText('Stretch')).toHaveLength(3)
    // 10/7 の 7:00 は始まっているので ✓ で達成
    const chip = view.container.querySelector<HTMLElement>(`[data-block-id="habit-slot::${id}::2026-10-07"]`)!
    fireEvent.click(within(chip).getByRole('button', { name: 'Done as planned (log it)' }))
    expect(useTaskStore.getState().habits[0]!.completedDates).toContain('2026-10-07')
    // 押すとカード
    fireEvent.click(chip)
    expect(await screen.findByRole('dialog', { name: 'Stretch' })).toBeInTheDocument()
  })

  it('今日の計画（1 日表示）には習慣の段を出さない', () => {
    useTaskStore.setState({ habits: [], tasks: [] })
    useTaskStore.getState().addHabit({
      title: 'Stretch',
      color: '#0B8043',
      timeMode: 'fixed',
      startTime: '22:00',
      endTime: null,
      frequency: { type: 'daily' },
      weekdayTimes: undefined,
      goalMinutes: undefined,
    })
    render(<WeekCalendarView anchor={fromDateKey('2026-10-07')} selectedDateKey="2026-10-07" singleDay />)
    expect(screen.queryByText('Habits')).toBeNull()
  })
})

describe('WeekCalendarView: 終日の行をたたんでも締切は出す', () => {
  it('置いた To-Do が多い日も、締切の旗は「他 N 件」に入れずに出す', () => {
    const at = (title: string, order: number, extra: object = {}) => ({
      ...makeTask({ title, listId: INBOX_LIST_ID, scheduledDate: '2026-10-07', ...extra }, order),
      id: title,
    })
    useTaskStore.setState({
      tasks: [at('A', 0), at('B', 1), at('C', 2), at('D', 3), at('Report', 4, { scheduledDate: '2026-10-06', dueDate: '2026-10-07' })],
    })
    render(<WeekCalendarView anchor={fromDateKey('2026-10-06')} selectedDateKey="2026-10-06" threeDay />)
    // 10/6 の置いた日のチップと、10/7 の締切の旗
    expect(screen.getAllByText('Report')).toHaveLength(2)
    expect(screen.getByText('+2 more')).toBeInTheDocument()
    expect(screen.queryByText('C')).toBeNull()
  })
})
