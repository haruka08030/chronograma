import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n/config'
import { useTaskStore } from '../store/taskStore'
import { setAppTimeZoneSetting } from '../lib/timeZone'
import { FloatingTimer } from './FloatingTimer'
import type { Task } from '../types/task'

/** 浮いているタイマーの「あと何分」（#290） */
const NOW = '2026-10-08T00:00:00.000Z' // 東京 9:00

beforeAll(async () => {
  await i18n.changeLanguage('ja')
})
afterAll(async () => {
  await i18n.changeLanguage('en')
  setAppTimeZoneSetting(null)
})
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false })
  vi.setSystemTime(new Date(NOW))
  useTaskStore.setState({ appTimeZone: 'Asia/Tokyo' })
})
afterEach(() => vi.useRealTimers())

const tick = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })

describe('浮いているタイマーの「あと何分」', () => {
  it('選ばなければ今までどおり経過を数え、「あと何分」から長さを選ぶと残り時間と終わりの時刻になる', () => {
    useTaskStore.getState().startTimer('レポート')
    render(<FloatingTimer />)
    tick(60_000)
    expect(screen.getByText('01:00')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'あと何分' }))
    const group = screen.getByRole('group', { name: '終わりの時間' })
    expect(group).toHaveTextContent('25分')
    expect(group).toHaveTextContent('50分')
    expect(group).toHaveTextContent('90分')
    fireEvent.click(screen.getByRole('button', { name: '25分' }))

    expect(useTaskStore.getState().activeTimer?.endsAt).toBe('2026-10-08T00:26:00.000Z')
    expect(screen.getByText('25:00')).toBeInTheDocument()
    expect(screen.getByText('残り · 09:26 まで')).toBeInTheDocument()
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    expect(document.title).toMatch(/^▶ 残り 0:25 レポート/)

    tick(10 * 60_000)
    expect(screen.getByText('15:00')).toBeInTheDocument()
  })

  it('時間になっても止めず、「時間です」と過ぎた時間を出す。押すと選び直し・外せる', () => {
    useTaskStore.getState().startTimer('レポート', [], null, null, { minutes: 25 })
    render(<FloatingTimer />)
    tick(27 * 60_000)
    expect(useTaskStore.getState().activeTimer).not.toBeNull()
    expect(screen.getByText('+02:00')).toBeInTheDocument()

    fireEvent.click(screen.getByText('時間です'))
    fireEvent.click(screen.getByRole('button', { name: '終わりなし' }))
    expect(useTaskStore.getState().activeTimer).not.toHaveProperty('endsAt')
    expect(screen.getByText('27:00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'あと何分' })).toBeInTheDocument()
  })

  it('予定から ▶ したときは、その予定の終わりも選べる', () => {
    const plan = {
      id: 'p1',
      title: 'ゼミ',
      kind: 'event',
      completed: false,
      scheduledDate: '2026-10-08',
      startTime: '09:00',
      endTime: '10:30',
    }
    useTaskStore.setState({ tasks: [plan as unknown as Task] })
    useTaskStore.getState().startTimer('ゼミ', [], 'p1')
    render(<FloatingTimer />)
    fireEvent.click(screen.getByRole('button', { name: 'あと何分' }))
    fireEvent.click(screen.getByRole('button', { name: '予定の終わり 10:30' }))
    expect(useTaskStore.getState().activeTimer?.endsAt).toBe('2026-10-08T01:30:00.000Z')
    expect(screen.getByText('残り · 10:30 まで')).toBeInTheDocument()
  })
})
