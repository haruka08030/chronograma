import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { TaskBinView } from './TaskBinView'
import { dispatchSelectAll } from '../lib/shortcuts'

// 完全に削除の確認（既定は「削除する」）
const confirm = vi.hoisted(() => ({ ask: vi.fn<(o: { message: string; confirmLabel?: string }) => Promise<boolean>>(async () => true) }))
vi.mock('../lib/confirmDialog', () => ({ askConfirm: confirm.ask }))

beforeAll(() => {
  // jsdom には無い（枠の行を見える所へ送る）
  Element.prototype.scrollIntoView = () => {}
})
beforeEach(() => {
  confirm.ask.mockClear()
})

const task = (id: string) => useTaskStore.getState().tasks.find((t) => t.id === id)

function seed(box: 'archived' | 'deleted') {
  const s = useTaskStore.getState()
  const ids = ['A', 'B', 'C'].map((title) => s.addTask(title)!)
  if (box === 'archived') s.archiveTasks(ids)
  else s.deleteTasks(ids)
  return ids
}

const row = (name: string) => screen.getByRole('option', { name })
const bar = () => screen.getByRole('toolbar')

describe('TaskBinView の複数選択', () => {
  it('アーカイブ: 行を押して選び、選択中のバーでまとめて戻す。元に戻すは 1 回で戻る', async () => {
    const user = userEvent.setup()
    const [a, b, c] = seed('archived')
    render(<TaskBinView mode="archived" />)
    await user.click(row('A'))
    await user.click(row('B'))
    expect(row('A')).toHaveAttribute('aria-selected', 'true')
    expect(row('C')).toHaveAttribute('aria-selected', 'false')
    expect(bar()).toHaveAccessibleName('2 selected')

    await user.click(within(bar()).getByRole('button', { name: 'Unarchive' }))
    expect(task(a)!.archivedAt).toBeNull()
    expect(task(b)!.archivedAt).toBeNull()
    expect(task(c)!.archivedAt).not.toBeNull()
    expect(useTaskStore.getState().undoBanner?.text).toEqual({ key: 'undo.tasksRestored', params: { count: 2 } })
    expect(screen.queryByRole('toolbar')).toBeNull()

    useTaskStore.getState().undoLastOperation()
    expect(task(a)!.archivedAt).not.toBeNull()
    expect(task(b)!.archivedAt).not.toBeNull()
  })

  it('アーカイブ: Shift で範囲を選び、右クリックのメニューで「削除」するとまとめてゴミ箱へ（確認なし）', async () => {
    const user = userEvent.setup()
    const [a, b, c] = seed('archived')
    render(<TaskBinView mode="archived" />)
    // 並びは新しい順（同じ時刻なら作った順のまま）。最初と最後を Shift で
    const options = screen.getAllByRole('option')
    await user.click(options[0])
    await user.keyboard('{Shift>}')
    await user.click(options[2])
    await user.keyboard('{/Shift}')
    expect(screen.getAllByRole('option', { selected: true })).toHaveLength(3)

    await user.pointer({ keys: '[MouseRight]', target: options[1] })
    expect(screen.getByText('3 tasks')).toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(confirm.ask).not.toHaveBeenCalled()
    for (const id of [a, b, c]) expect(task(id)!.deletedAt).not.toBeNull()
  })

  it('ゴミ箱: ⌘A（App から届く全選択）で全部選び、完全に削除は件数を出して確認してから消す', async () => {
    const user = userEvent.setup()
    const [a, b, c] = seed('deleted')
    useTaskStore.getState().addTask('sub', undefined, a)
    useTaskStore.getState().deleteTask(a)
    render(<TaskBinView mode="deleted" />)
    // 開いた直後の選択の解除（resetOn）を先に済ませる
    await act(async () => {})
    act(() => void dispatchSelectAll())
    expect(bar()).toHaveAccessibleName('3 selected')

    confirm.ask.mockResolvedValueOnce(false)
    await user.click(within(bar()).getByRole('button', { name: 'Delete permanently' }))
    expect(confirm.ask).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Permanently delete 3 tasks (and their 1 subtasks)? This cannot be undone.',
        confirmLabel: 'Permanently delete 3',
      }),
    )
    // やめたら何も消さない
    expect(task(a)).toBeDefined()

    act(() => void dispatchSelectAll())
    await user.click(within(bar()).getByRole('button', { name: 'Delete permanently' }))
    for (const id of [a, b, c]) expect(task(id)).toBeUndefined()
    expect(useTaskStore.getState().tasks.some((t) => t.title === 'sub')).toBe(false)
  })

  it('ゴミ箱: 選んだ行をまとめて戻す', async () => {
    const user = userEvent.setup()
    const [a, b] = seed('deleted')
    render(<TaskBinView mode="deleted" />)
    await user.click(row('A'))
    await user.click(row('B'))
    await user.click(within(bar()).getByRole('button', { name: 'Restore' }))
    expect(task(a)!.deletedAt).toBeNull()
    expect(task(b)!.deletedAt).toBeNull()
  })

  it('行のボタンはその行だけに効き、選択には入れない', async () => {
    const user = userEvent.setup()
    const [a, b] = seed('archived')
    render(<TaskBinView mode="archived" />)
    await user.click(within(row('A')).getByRole('button', { name: 'Unarchive' }))
    expect(task(a)!.archivedAt).toBeNull()
    expect(task(b)!.archivedAt).not.toBeNull()
    expect(screen.queryByRole('toolbar')).toBeNull()
  })
})
