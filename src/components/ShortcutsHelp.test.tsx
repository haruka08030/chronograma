import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ShortcutsHelp } from './ShortcutsHelp'

describe('ShortcutsHelp', () => {
  it('タイムラインのブロックを動かす・伸び縮みするキーが載る', () => {
    render(<ShortcutsHelp onClose={() => {}} />)
    const move = screen.getByText('Move the focused or open timeline block 15 minutes earlier / later').closest('li')!
    expect(Array.from(move.querySelectorAll('kbd')).map((k) => k.textContent)).toEqual(['Alt', '↑', 'Alt', '↓'])
    const resize = screen.getByText('Make the focused or open timeline block end 15 minutes earlier / later').closest('li')!
    expect(Array.from(resize.querySelectorAll('kbd')).map((k) => k.textContent)).toEqual(['Alt', 'Shift', '↑', 'Alt', 'Shift', '↓'])
  })
})
