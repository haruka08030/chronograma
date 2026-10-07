import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useTextEntry } from './useTextEntry'

function Field({ onSubmit, onCancel }: { onSubmit: () => void; onCancel: () => void }) {
  const [v, setV] = useState('れぽーと')
  const entry = useTextEntry({ onSubmit, onCancel, commitOnBlur: false })
  return <input aria-label="Title" value={v} onChange={(e) => setV(e.target.value)} {...entry} />
}

describe('useTextEntry', () => {
  it('Safari の変換を取り消す Esc・確定する Enter（isComposing=false・keyCode 229）では取り消しも送信もしない', () => {
    const onSubmit = vi.fn()
    const onCancel = vi.fn()
    render(<Field onSubmit={onSubmit} onCancel={onCancel} />)
    const input = screen.getByRole('textbox', { name: 'Title' })

    fireEvent.keyDown(input, { key: 'Escape', keyCode: 229 })
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 })
    expect(onCancel).not.toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()

    fireEvent.keyDown(input, { key: 'Escape', keyCode: 27 })
    expect(onCancel).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 })
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})
