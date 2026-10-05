import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { TaskDetail } from './TaskDetail'

function renderDetail(description = '') {
  const id = useTaskStore.getState().addTask('Buy milk')!
  if (description) useTaskStore.getState().updateTask(id, { description })
  const task = useTaskStore.getState().tasks.find((t) => t.id === id)!
  return render(<TaskDetail task={task} onClose={() => {}} />)
}

describe('TaskDetail（キー操作・読み上げ）', () => {
  it('題名は見出しの中のボタンで、Enter で名前の欄になる', async () => {
    const user = userEvent.setup()
    renderDetail()
    const heading = screen.getByRole('heading', { name: 'Buy milk' })
    const button = screen.getByRole('button', { name: 'Buy milk', description: 'Edit title' })
    expect(heading).toContainElement(button)

    button.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('textbox', { name: 'Edit title' })).toHaveValue('Buy milk')
  })

  it('メモがあるときもキーで編集に入れる', async () => {
    const user = userEvent.setup()
    renderDetail('see https://example.com')
    // メモの中のリンクはそのまま押せる
    expect(screen.getByRole('link', { name: 'https://example.com' })).toBeInTheDocument()

    screen.getByRole('button', { name: 'Edit notes' }).focus()
    await user.keyboard('{Enter}')
    expect(screen.getByPlaceholderText('Add notes…')).toHaveValue('see https://example.com')
  })

  it('メモが空なら、メモ欄そのものがボタン', () => {
    renderDetail()
    expect(screen.getByRole('button', { name: 'Add notes…' })).toBeInTheDocument()
  })
})
