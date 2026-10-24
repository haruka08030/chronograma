import { act, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { makeTask } from '../store/taskHelpers'
import { INBOX_LIST_ID } from '../store/storeConstants'
import type { Task } from '../types/task'
import { openWrapUpFromNotification } from '../lib/notificationLaunch'
import { TodayPlannerView } from './TodayPlannerView'

/**
 * 今日の計画の下の締め（#299・#501）: 気分の記号を出し始める時刻は設定の夜のまとめの時刻（未設定なら 17 時）。
 * 夜のまとめの通知から開くと、時刻に関係なく出してそこまでスクロールする。
 * 残りを明日へ・記録の無い時間は並べない。ラベルなしの記録は記録の帯の凡例の「ラベルなし」から付ける
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

const MOOD = "Today's mood"
const mood = () => screen.queryByRole('group', { name: MOOD })

describe('締めを出す時刻', () => {
  it('夜のまとめの時刻が無ければ今までどおり 17 時から気分の記号を出す', () => {
    useTaskStore.setState({ tasks: [todo('a'), todo('b')] })
    at(16, 59)
    const { unmount } = render(<TodayPlannerView />)
    expect(mood()).toBeNull()
    unmount()
    at(17)
    render(<TodayPlannerView />)
    expect(mood()).toBeInTheDocument()
  })

  it('夜のまとめの時刻を決めていれば、その時刻から', () => {
    useTaskStore.setState({ tasks: [todo('a'), todo('b')], dailyReminders: { planTime: null, wrapUpTime: '21:30' } })
    at(21, 29)
    const { unmount } = render(<TodayPlannerView />)
    expect(mood()).toBeNull()
    unmount()
    at(21, 30)
    render(<TodayPlannerView />)
    expect(mood()).toBeInTheDocument()
  })

  it('残りを明日へ回すボタン・記録の無い時間は出さない（次の日のやり残し・タイムラインの「＋ 記録なし」で足りる）', () => {
    useTaskStore.setState({ tasks: [todo('a'), todo('b')] })
    at(21)
    render(<TodayPlannerView />)
    // 行ごとの「明日へ」はそのまま。締めの所にまとめて回すボタンは無い
    expect(within(document.querySelector('[data-wrap-up]') as HTMLElement).queryByRole('button', { name: 'Move to tomorrow' })).toBeNull()
    expect(document.querySelector('[data-wrap-up-gaps]')).toBeNull()
  })
})

describe('夜のまとめの通知から開いたとき', () => {
  it('時刻の前でも気分の記号を出し、そこまでスクロールする。スマホはタイムラインの面を出す', () => {
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView')
    useTaskStore.setState({ tasks: [todo('a'), todo('b')], dailyReminders: { planTime: null, wrapUpTime: '22:00' } })
    render(<TodayPlannerView />)
    expect(mood()).toBeNull()
    act(() => openWrapUpFromNotification())
    expect(mood()).toBeInTheDocument()
    expect(scroll.mock.contexts).toContain(document.querySelector('[data-wrap-up]'))
    expect(screen.getByRole('tab', { name: 'Timeline' })).toHaveAttribute('aria-selected', 'true')
  })

  it('通知を押してから今日の計画を描いても受け取る（起動したとき）', () => {
    useTaskStore.setState({ tasks: [todo('a'), todo('b')] })
    useTaskStore.getState().setSelectedCalendarDateKey('2026-10-01')
    openWrapUpFromNotification()
    expect(useTaskStore.getState().selectedView).toBe('planner')
    // 見ている日は今日に戻る
    expect(useTaskStore.getState().selectedCalendarDateKey).toBe(DAY)
    render(<TodayPlannerView />)
    expect(mood()).toBeInTheDocument()
  })
})

describe('ラベルなしの記録（#390・#501）', () => {
  it('記録の帯の凡例の「ラベルなし」を押すとラベルなしの記録を行で並べ、行の色の一覧でその場で付ける（付けた行は残る）', async () => {
    vi.useRealTimers()
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true })
    at(18)
    const log = (id: string, startTime: string, endTime: string, over: Partial<Task> = {}) =>
      todo(id, { kind: 'log', dueDate: DAY, scheduledDate: null, startTime, endTime, completed: true, ...over })
    useTaskStore.setState({
      timeLogTagPresets: ['勉強', 'バイト'],
      tasks: [
        todo('a'),
        log('読書', '09:00', '10:00'),
        log('数学', '11:00', '12:00'),
        log('英語', '13:00', '14:00', { category: '勉強', tags: ['勉強'] }),
      ],
    })
    render(<TodayPlannerView />)
    const toggle = screen.getByRole('button', { name: /No label/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    act(() => toggle.click())
    const list = document.querySelector('[data-untagged-logs]') as HTMLElement
    const rows = within(list).getAllByRole('listitem')
    expect(rows.map((r) => within(r).getAllByRole('button')[0]!.textContent)).toEqual(['読書09:00–10:00', '数学11:00–12:00'])
    act(() => within(rows[0]!).getByRole('button', { name: 'Color and label' }).click())
    act(() => within(rows[0]!).getByRole('radio', { name: 'バイト' }).click())
    expect(useTaskStore.getState().tasks.find((x) => x.id === '読書')).toMatchObject({ category: 'バイト' })
    // 付けた行も残り、選んだラベルが見える
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(within(rows[0]!).getByRole('button', { name: 'Color and label' })).toHaveTextContent('バイト')
  })
})
