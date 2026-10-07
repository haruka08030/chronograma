import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { SearchBox } from './SearchBox'
import { SearchResults } from './SearchResults'

const openTaskDetail = vi.hoisted(() => vi.fn())
vi.mock('../lib/overlays', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/overlays')>()),
  openTaskDetail,
}))

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {}
})

describe('SearchBox', () => {
  it('↓ で結果の一覧へフォーカスが移り、最初の行が aria-activedescendant になる', async () => {
    useTaskStore.getState().addTask('Buy milk')
    useTaskStore.getState().addTask('Buy bread')
    useTaskStore.getState().setSearchQuery('Buy')
    const user = userEvent.setup()
    render(
      <>
        <SearchBox inputRef={createRef()} />
        <SearchResults />
      </>,
    )
    await user.click(screen.getByRole('textbox'))
    await user.keyboard('{ArrowDown}')

    const list = await screen.findByRole('listbox')
    expect(list).toHaveFocus()
    const first = screen.getAllByRole('option')[0]
    expect(list).toHaveAttribute('aria-activedescendant', first.id)
  })

  it('Safari の変換を確定する Enter・取り消す Esc（keyCode 229）では結果を開かず、文字も消さない', () => {
    useTaskStore.getState().addTask('レポート')
    useTaskStore.getState().setSearchQuery('レポート')
    render(<SearchBox inputRef={createRef()} />)
    const input = screen.getByRole('textbox')

    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 })
    fireEvent.keyDown(input, { key: 'Escape', keyCode: 229 })
    expect(openTaskDetail).not.toHaveBeenCalled()
    expect(useTaskStore.getState().searchQuery).toBe('レポート')

    fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 })
    expect(openTaskDetail).toHaveBeenCalledTimes(1)
  })
})
