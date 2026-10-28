import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../../store/taskStore'
import { everyDaySleepSchedule } from '../../lib/sleepSchedule'
import { SleepSlotPopover } from './SleepSlotPopover'

const anchor = { top: 100, left: 100, right: 200, bottom: 140 }
const WAKE = '2026-10-20'
const days = () => useTaskStore.getState().addons.sleepDays ?? {}

beforeEach(() => {
  useTaskStore.setState((s) => ({
    addons: { ...s.addons, sleepSchedule: everyDaySleepSchedule({ bed: '23:30', wake: '07:00' }), sleepDays: {} },
  }))
})

describe('睡眠の予定の枠のカード（#660）', () => {
  it('🗑 でその朝だけ予定なしにして閉じる（曜日の予定はそのまま）', async () => {
    const onClose = vi.fn()
    render(<SleepSlotPopover wakeDate={WAKE} anchor={anchor} onClose={onClose} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Remove the sleep plan for this day' }))
    expect(days()).toEqual({ [WAKE]: null })
    expect(useTaskStore.getState().addons.sleepSchedule?.[2]).toEqual({ bed: '23:30', wake: '07:00' })
    expect(onClose).toHaveBeenCalled()
  })

  it('その朝だけ変えた日は「いつもの時間に戻す」で戻る', async () => {
    useTaskStore.getState().setSleepPlanDay(WAKE, { bed: '01:00', wake: '09:00' })
    render(<SleepSlotPopover wakeDate={WAKE} anchor={anchor} onClose={() => {}} />)
    expect(screen.getAllByRole('combobox')[0]).toHaveValue('01:00')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Back to usual (23:30–07:00)' }))
    expect(days()).toEqual({})
  })

  it('起きる時刻を過ぎた朝は ✓ でその時間どおりの睡眠を記録する', async () => {
    render(<SleepSlotPopover wakeDate="2020-01-01" anchor={anchor} onClose={() => {}} />)
    await userEvent.setup().click(screen.getByRole('button', { name: /as planned/i }))
    const sleep = useTaskStore.getState().tasks.find((t) => t.kind === 'sleep' && t.endDate === '2020-01-01')
    expect(sleep).toMatchObject({ startTime: '23:30', endTime: '07:00' })
  })
})
