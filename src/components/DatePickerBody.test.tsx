import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n/config'
import { DatePickerBody } from './DatePickerBody'

beforeAll(async () => {
  await i18n.changeLanguage('ja')
})

describe('DatePickerBody の入力欄', () => {
  it('PC は開くと入力欄にフォーカス。打つとその日の月を見せ、Enter で決める', async () => {
    const onPick = vi.fn()
    render(<DatePickerBody value="2026-10-07" onPick={onPick} autoFocus />)
    const input = screen.getByRole('textbox', { name: '日付を入力' })
    expect(input).toHaveFocus()
    await userEvent.keyboard('2027/1/5')
    expect(screen.getByRole('button', { name: '5', pressed: true })).toHaveAttribute('data-day', '2027-01-05')
    await userEvent.keyboard('{Enter}')
    expect(onPick).toHaveBeenCalledWith('2027-01-05')
  })

  it('日だけは見ている月のその日', async () => {
    const onPick = vi.fn()
    render(<DatePickerBody value="2026-10-07" onPick={onPick} autoFocus />)
    await userEvent.keyboard('20{Enter}')
    expect(onPick).toHaveBeenCalledWith('2026-10-20')
  })

  it('読めない・下限より前の日は Enter で決めない', async () => {
    const onPick = vi.fn()
    render(<DatePickerBody value="2026-10-07" min="2026-10-07" onPick={onPick} autoFocus />)
    const input = screen.getByRole('textbox', { name: '日付を入力' })
    await userEvent.keyboard('あいう{Enter}')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    await userEvent.clear(input)
    await userEvent.keyboard('2026/10/1{Enter}')
    expect(onPick).not.toHaveBeenCalled()
  })
})
