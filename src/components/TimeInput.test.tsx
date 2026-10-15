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
})
