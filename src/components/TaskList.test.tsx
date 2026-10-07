import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it } from 'vitest'
import { DndContext } from '@dnd-kit/core'
import { useTaskStore } from '../store/taskStore'
import { TaskList } from './TaskList'

/** 一覧はアプリでは DndContext の中に置く（並べ替え） */
const renderList = () =>
  render(
    <DndContext>
      <input aria-label="Other field" />
      <TaskList />
    </DndContext>,
  )

beforeAll(() => {
  // jsdom には無い（枠の行を見える所へ送る）
  Element.prototype.scrollIntoView = () => {}
})

describe('TaskList（読み上げ）', () => {
  it('行は listbox の option、完了の印はタスク名つきのチェックボックス', () => {
    useTaskStore.getState().addTask('Buy milk')
    useTaskStore.getState().addTask('Call mom')
    renderList()

    const list = screen.getByRole('listbox')
    expect(list).toHaveAttribute('aria-multiselectable', 'true')
    const options = within(list).getAllByRole('option')
    expect(options).toHaveLength(2)
    expect(within(list).getByRole('option', { name: 'Buy milk' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('checkbox', { name: 'Complete “Buy milk”' })).toHaveAttribute('aria-checked', 'false')
    // タイトルは本物のボタン（押すと名前を変える）
    expect(screen.getByRole('button', { name: 'Buy milk' })).toBeInTheDocument()
  })

  it('↓ で一覧にフォーカスが移り、aria-activedescendant が今の行を指す', async () => {
    useTaskStore.getState().addTask('Buy milk')
    useTaskStore.getState().addTask('Call mom')
    const user = userEvent.setup()
    renderList()
    const list = screen.getByRole('listbox')
    expect(list).not.toHaveAttribute('aria-activedescendant')

    await user.keyboard('{ArrowDown}')
    expect(list).toHaveFocus()
    const first = list.getAttribute('aria-activedescendant')
    expect(first).toBeTruthy()
    const firstRow = document.getElementById(first!)!
    expect(firstRow).toHaveAttribute('role', 'option')

    await user.keyboard('{ArrowDown}')
    const second = list.getAttribute('aria-activedescendant')
    expect(second).not.toBe(first)
    expect(document.getElementById(second!)).toHaveAttribute('role', 'option')

    // Shift+↑ で選ぶと aria-selected が付く
    await user.keyboard('{Shift>}{ArrowUp}{/Shift}')
    for (const option of within(list).getAllByRole('option')) expect(option).toHaveAttribute('aria-selected', 'true')
  })

  it('入力欄で ↓ を押しても一覧は動かない', async () => {
    useTaskStore.getState().addTask('Buy milk')
    const user = userEvent.setup()
    renderList()
    const input = screen.getByRole('textbox', { name: 'Other field' })
    await user.click(input)
    await user.keyboard('{ArrowDown}')
    expect(input).toHaveFocus()
    expect(screen.getByRole('listbox')).not.toHaveAttribute('aria-activedescendant')
  })

  it('セクションの塊は listbox の中の group（名前はセクション名）で、その中に行の option', () => {
    const state = useTaskStore.getState()
    const listId = state.selectedListId!
    const sectionId = state.addSection(listId, 'Errands')
    const taskId = state.addTask('Buy milk')!
    useTaskStore.getState().updateTask(taskId, { sectionId })
    renderList()

    const list = screen.getByRole('listbox')
    const group = within(list).getByRole('group', { name: 'Errands' })
    expect(within(group).getByRole('option', { name: 'Buy milk' })).toBeInTheDocument()
  })
})
