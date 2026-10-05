import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { SearchBox } from './SearchBox'
import { SearchResults } from './SearchResults'

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
})
