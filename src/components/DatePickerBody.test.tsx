import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '../i18n/config'
import { useTaskStore } from '../store/taskStore'
import { DatePickerBody } from './DatePickerBody'

const dayKeys = (container: HTMLElement) => [...container.querySelectorAll('[data-day]')].map((el) => el.getAttribute('data-day'))

describe('DatePickerBody', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    useTaskStore.getState().setWeekStartsOn(1)
  })

  it('日の格子は月を送っても常に 6 週（42 日）', async () => {
    // 2026 年 2 月は月曜はじまりで 4 週ちょうどに収まる月
    const { container } = render(<DatePickerBody value="2026-02-10" onPick={() => {}} />)
    expect(dayKeys(container)).toHaveLength(42)
    expect(dayKeys(container)[0]).toBe('2026-01-26')
    await userEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(dayKeys(container)).toHaveLength(42)
  })

  it('« » で同じ月の前後の年に移る', async () => {
    const { container } = render(<DatePickerBody value="2026-10-07" onPick={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Next year' }))
    expect(dayKeys(container)).toContain('2027-10-15')
    await userEvent.click(screen.getByRole('button', { name: 'Previous year' }))
    await userEvent.click(screen.getByRole('button', { name: 'Previous year' }))
    expect(dayKeys(container)).toContain('2025-10-15')
  })

  it('Shift+PageDown で 1 年先の同じ日へ', async () => {
    render(<DatePickerBody value="2026-10-07" onPick={() => {}} autoFocus />)
    await userEvent.keyboard('{Shift>}{PageDown}{/Shift}')
    expect(document.activeElement?.getAttribute('data-day')).toBe('2027-10-07')
  })
})
