import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { TaskDetail } from './TaskDetail'
import { useOverlays } from '../lib/overlays'

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
    expect(screen.getByRole('link', { name: /example\.com/ })).toBeInTheDocument()

    screen.getByRole('button', { name: 'Edit notes' }).focus()
    await user.keyboard('{Enter}')
    expect(screen.getByPlaceholderText('Add notes…')).toHaveValue('see https://example.com')
  })

  it('メモが空なら、メモ欄そのものがボタン', () => {
    renderDetail()
    expect(screen.getByRole('button', { name: 'Add notes…' })).toBeInTheDocument()
  })
})

describe('TaskDetail の並び（#380）', () => {
  it('題名 → 実行日 → 締切 → 見積もり → 優先度 → 場所 → メモ', () => {
    const { container } = renderDetail()
    const text = container.textContent ?? ''
    const order = ['Buy milk', 'Do date', 'Due date', 'Estimate', 'Priority', 'Location', 'Add notes…'].map((s) => text.indexOf(s))
    expect(order.every((i) => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('外を押したら閉じるだけで、押した所の別の行は開かない', async () => {
    const otherId = useTaskStore.getState().addTask('Other')!
    const id = useTaskStore.getState().addTask('Buy milk')!
    const task = useTaskStore.getState().tasks.find((t) => t.id === id)!
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <>
        <div data-task-row={otherId}>
          <span>Other</span>
        </div>
        <TaskDetail task={task} onClose={onClose} />
      </>,
    )
    // 開いた押下で閉じないよう、1 拍置いてから外を押す
    await act(() => new Promise((r) => setTimeout(r, 0)))
    const backdrop = screen.getByRole('dialog').parentElement!
    const under = document.elementsFromPoint
    document.elementsFromPoint = () => [screen.getByText('Other')]
    try {
      await user.click(backdrop)
    } finally {
      document.elementsFromPoint = under
    }
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(useOverlays.getState().detailTaskId).not.toBe(otherId)
  })
})

describe('TaskDetail のサブタスク（#613）', () => {
  it('消した・アーカイブした子は欄から消え、件数にも入れない', async () => {
    const s = useTaskStore.getState()
    const id = s.addTask('Trip')!
    const kids = ['Pack', 'Passport', 'Ticket'].map((title) => s.addTask(title)!)
    useTaskStore.setState({ tasks: useTaskStore.getState().tasks.map((t) => (kids.includes(t.id) ? { ...t, parentId: id } : t)) })
    const user = userEvent.setup()
    render(<TaskDetail task={useTaskStore.getState().tasks.find((t) => t.id === id)!} onClose={() => {}} />)
    const row = (title: string) => screen.queryByText(title)?.closest<HTMLElement>('[data-task-row]') ?? null

    await user.click(within(row('Pack')!).getByRole('button', { name: 'Delete' }))
    act(() => useTaskStore.getState().archiveTasks([kids[1]!]))
    expect(row('Pack')).toBeNull()
    expect(row('Passport')).toBeNull()
    expect(row('Ticket')).not.toBeNull()
    expect(screen.getByText('Subtasks (1)')).toBeInTheDocument()
  })

  it('右上の … で行と同じタスクのメニューを開き（「編集」は出さない）、消したら詳細も閉じる', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const id = useTaskStore.getState().addTask('Buy milk')!
    render(<TaskDetail task={useTaskStore.getState().tasks.find((t) => t.id === id)!} onClose={onClose} />)
    await user.click(screen.getAllByRole('button', { name: 'Task menu' })[0]!)
    const menu = useOverlays.getState().menu
    expect(menu).toMatchObject({ kind: 'task', taskIds: [id], inDetail: true })
    act(() => {
      useTaskStore.getState().deleteTasks([id])
      if (menu?.kind === 'task') menu.onDone?.()
    })
    expect(onClose).toHaveBeenCalled()
  })
})
