import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { SleepRow } from './SleepRow'

/** 今日の睡眠の行の「寝る」「起きた」（睡眠のタイマー、#519） */
const at = (d: number, h: number, m = 0) => vi.setSystemTime(new Date(2026, 9, d, h, m))

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }))
afterEach(() => vi.useRealTimers())

describe('寝る・起きた', () => {
  it('昼に寝て起きたら昼寝になり、夜の睡眠は残して「＋昼寝」を添える（#645）', () => {
    at(8, 7, 0)
    useTaskStore.getState().logSleep('2026-10-08', '23:30', '07:00')
    at(8, 13, 0)
    const { rerender } = render(<SleepRow dateKey="2026-10-08" />)
    act(() => screen.getByRole('button', { name: 'Go to bed' }).click())
    at(8, 16, 0)
    rerender(<SleepRow key="after" dateKey="2026-10-08" />)
    act(() => screen.getByRole('button', { name: 'Woke up' }).click())
    expect(screen.getByRole('button', { name: /23:30–07:00 7h 30m \+ nap 3h/ })).toBeInTheDocument()
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

  it('寝ている間も、その朝の睡眠の行は残す', () => {
    at(8, 7, 0)
    useTaskStore.getState().logSleep('2026-10-08', '23:30', '07:00')
    at(8, 23, 40)
    render(<SleepRow dateKey="2026-10-08" />)
    act(() => screen.getByRole('button', { name: 'Go to bed' }).click())
    expect(screen.getByText('Asleep since 23:40')).toBeInTheDocument()
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

describe('睡眠のページへ', () => {
  it('行頭の ☾ を押すと睡眠のページを開く', () => {
    at(8, 13)
    useTaskStore.getState().logSleep('2026-10-08', '23:30', '07:00')
    render(<SleepRow dateKey="2026-10-08" />)
    act(() => screen.getByRole('button', { name: 'Sleep page' }).click())
    expect(useTaskStore.getState().selectedView).toBe('sleep')
  })
})

describe('記録の無い朝（#649）', () => {
  it('前回の睡眠があっても、欄は空で ✓ は押せない', () => {
    at(7, 9)
    useTaskStore.getState().logSleep('2026-10-07', '23:30', '07:00')
    at(8, 9)
    render(<SleepRow dateKey="2026-10-08" />)
    const [bed, wake] = screen.getAllByRole('combobox')
    expect(bed).toHaveValue('')
    expect(wake).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })
})

describe('候補を開いたときの最初の位置（#666）', () => {
  /** 空欄の寝た時刻の欄を開いて、ハイライトした候補の時刻 */
  const openedAt = () => {
    const [bed] = screen.getAllByRole('combobox')
    fireEvent.focus(bed!)
    return document.getElementById(bed!.getAttribute('aria-activedescendant')!)?.textContent
  }

  it('その朝だけの時刻があればその時刻、無ければ曜日の予定', () => {
    at(7, 9)
    useTaskStore.getState().logSleep('2026-10-07', '22:00', '06:00')
    // 2026-10-08 は木曜日
    useTaskStore.getState().setSleepSchedule({ 4: { bed: '23:00', wake: '07:00' } })
    at(8, 9)
    const { unmount } = render(<SleepRow dateKey="2026-10-08" />)
    expect(openedAt()).toContain('23:00')
    unmount()
    act(() => useTaskStore.getState().setSleepPlanDay('2026-10-08', { bed: '01:00', wake: '08:00' }))
    render(<SleepRow dateKey="2026-10-08" />)
    expect(openedAt()).toContain('01:00')
  })

  it('その朝を予定なしにした日は前回の夜の睡眠の時刻', () => {
    at(7, 9)
    useTaskStore.getState().logSleep('2026-10-07', '22:00', '06:00')
    useTaskStore.getState().setSleepSchedule({ 4: { bed: '23:00', wake: '07:00' } })
    act(() => useTaskStore.getState().setSleepPlanDay('2026-10-08', null))
    at(8, 9)
    render(<SleepRow dateKey="2026-10-08" />)
    expect(openedAt()).toContain('22:00')
  })
})
