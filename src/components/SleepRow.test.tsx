import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { SleepRow } from './SleepRow'

/** 今日の睡眠の行の「寝る」「起きた」（睡眠のタイマー、#519） */
const at = (d: number, h: number, m = 0) => vi.setSystemTime(new Date(2026, 9, d, h, m))

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }))
afterEach(() => vi.useRealTimers())

describe('寝る・起きた', () => {
  it('昼は「寝る」を出さず、夜 20 時から出す', () => {
    at(8, 15)
    const { unmount } = render(<SleepRow dateKey="2026-10-08" />)
    expect(screen.queryByRole('button', { name: 'Go to bed' })).toBeNull()
    unmount()
    at(8, 21)
    render(<SleepRow dateKey="2026-10-08" />)
    expect(screen.getByRole('button', { name: 'Go to bed' })).toBeInTheDocument()
  })

  it('寝ると押すと「◯ から寝ています」になり、翌朝「起きた」でその朝の睡眠になる', () => {
    at(7, 23, 30)
    const { rerender } = render(<SleepRow dateKey="2026-10-07" />)
    act(() => screen.getByRole('button', { name: 'Go to bed' }).click())
    expect(screen.getByText('Asleep since 23:30')).toBeInTheDocument()

    at(8, 7, 0)
    rerender(<SleepRow key="next" dateKey="2026-10-08" />)
    expect(screen.getByText('Asleep since 23:30')).toBeInTheDocument()
    act(() => screen.getByRole('button', { name: 'Woke up' }).click())
    expect(useTaskStore.getState().sleepTimer).toBeNull()
    expect(screen.getByRole('button', { name: /23:30–07:00/ })).toBeInTheDocument()
  })

  it('寝たまま 16 時間を過ぎたら、寝た時刻を入れた欄で起きた時刻を聞く', () => {
    at(7, 23, 0)
    useTaskStore.getState().goToBed()
    at(8, 16, 0)
    render(<SleepRow dateKey="2026-10-08" />)
    expect(screen.getByText('Went to bed at 23:00. When did you wake up?')).toBeInTheDocument()
    expect(screen.getAllByRole('combobox')[0]).toHaveValue('23:00')
  })
})
