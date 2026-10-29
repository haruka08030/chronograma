import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TimeInput } from './TimeInput'

describe('TimeInput の候補', () => {
  it('候補はカードの中ではなく body 直下に出し、押しても周りのカードは閉じない（data-popover-keep）', async () => {
    const onChange = vi.fn()
    const { container } = render(
      <div style={{ overflowY: 'auto', height: 100 }}>
        <TimeInput value="15:00" onChange={onChange} ariaLabel="開始" />
      </div>,
    )
    await userEvent.click(screen.getByRole('combobox', { name: '開始' }))
    const list = screen.getByRole('listbox')
    expect(container.contains(list)).toBe(false)
    expect(list).toHaveAttribute('data-popover-keep')
    expect(list.style.position).toBe('fixed')
    await userEvent.click(screen.getByRole('option', { name: /15:30/ }))
    expect(onChange).toHaveBeenCalledWith('15:30')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('候補から選んだ後、そのまま消して打ち直せる', async () => {
    const onChange = vi.fn()
    const { rerender } = render(<TimeInput value="15:00" onChange={onChange} ariaLabel="開始" />)
    const input = screen.getByRole('combobox', { name: '開始' })
    await userEvent.click(input)
    await userEvent.click(screen.getByRole('option', { name: /15:30/ }))
    rerender(<TimeInput value="15:30" onChange={onChange} ariaLabel="開始" />)
    expect(input).toHaveFocus()
    await userEvent.keyboard('{Backspace}{Backspace}')
    expect(input).toHaveValue('15:')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    await userEvent.keyboard('45{Enter}')
    expect(onChange).toHaveBeenLastCalledWith('15:45')
  })

  it('終わりの欄（durationFrom）は開始の 15 分後から長さを添えて並べ、予定は日の終わりまで', async () => {
    render(<TimeInput value="" onChange={vi.fn()} ariaLabel="終了" durationFrom="22:30" />)
    await userEvent.click(screen.getByRole('combobox', { name: '終了' }))
    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveTextContent('22:45')
    expect(options[0]).toHaveTextContent('15')
    expect(options.at(-1)).toHaveTextContent('23:45')
    expect(options).toHaveLength(5)
  })

  it('翌日まで続く欄（overnight）は開始から 1 周並べる', async () => {
    render(<TimeInput value="" onChange={vi.fn()} ariaLabel="終了" durationFrom="22:30" overnight />)
    await userEvent.click(screen.getByRole('combobox', { name: '終了' }))
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(95)
    expect(options.at(-1)).toHaveTextContent('22:15')
  })
})
