import { useRef, useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { useGlobalShortcuts } from '../hooks/useGlobalShortcuts'
import { useOverlays } from '../lib/overlays'
import { toDateKey } from '../lib/dateKey'
import { appToday } from '../lib/timeZone'
import { SearchPalette } from './SearchPalette'

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {}
})

/** App と同じつなぎ方（⌘K でパレットを開く）。開く前のフォーカス先にボタンを置く */
function Harness() {
  const searchRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  useGlobalShortcuts({ searchRef, onShowHelp: () => {}, onOpenPalette: () => setOpen(true) })
  return (
    <>
      <button type="button">before</button>
      {open && <SearchPalette onClose={() => setOpen(false)} />}
    </>
  )
}

const task = (id: string) => useTaskStore.getState().tasks.find((t) => t.id === id)!

async function openPalette() {
  const user = userEvent.setup()
  render(<Harness />)
  screen.getByRole('button', { name: 'before' }).focus()
  await user.keyboard('{Meta>}k{/Meta}')
  return user
}

describe('SearchPalette（⌘K）', () => {
  it('⌘K で今の画面のまま開いて欄にフォーカスし、Esc で閉じると元のフォーカスへ戻る', async () => {
    useTaskStore.getState().selectView('planner')
    const user = await openPalette()
    expect(screen.getByRole('dialog', { name: 'Search palette' })).toBeInTheDocument()
    expect(screen.getByRole('combobox')).toHaveFocus()
    expect(useTaskStore.getState().selectedView).toBe('planner')
    expect(useTaskStore.getState().searchQuery).toBe('')

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'before' })).toHaveFocus()
  })

  it('もう一度 ⌘K でも閉じる', async () => {
    const user = await openPalette()
    await user.keyboard('{Meta>}k{/Meta}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'before' })).toHaveFocus()
  })

  it('記録は出さない（To-Do の検索欄と同じ searchTasks。#288）', async () => {
    const s = useTaskStore.getState()
    s.addTask('Buy milk')
    s.addTimeLog('Buy groceries', '2026-10-01', '09:00', '10:00', [])
    const user = await openPalette()
    await user.type(screen.getByRole('combobox'), 'buy')
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(1)
    expect(options[0]).toHaveTextContent('Buy milk')
  })

  it('打つと題名で絞り、↑↓ で選んで Enter で詳細を開く（閉じてから）', async () => {
    const s = useTaskStore.getState()
    s.addTask('Buy milk')
    const bread = s.addTask('Buy bread')!
    s.addTask('Write report')
    const user = await openPalette()
    await user.type(screen.getByRole('combobox'), 'buy')

    const options = screen.getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual([expect.stringContaining('Buy milk'), expect.stringContaining('Buy bread')])
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-activedescendant', options[0].id)

    await user.keyboard('{ArrowDown}')
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowDown}')
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowUp}')

    await user.keyboard('{Enter}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(useOverlays.getState().detailTaskId).toBe(bread)
  })

  it('⌥T で選んだ To-Do を今日に入れる', async () => {
    const id = useTaskStore.getState().addTask('Read paper')!
    const user = await openPalette()
    await user.type(screen.getByRole('combobox'), 'paper')
    expect(screen.getByRole('button', { name: /Do today/ })).toBeInTheDocument()
    await user.keyboard('{Alt>}t{/Alt}')
    expect(task(id).scheduledDate).toBe(toDateKey(appToday()))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('⌥L で記録を始める', async () => {
    const id = useTaskStore.getState().addTask('Read paper')!
    const user = await openPalette()
    await user.type(screen.getByRole('combobox'), 'paper')
    await user.keyboard('{Alt>}l{/Alt}')
    expect(useTaskStore.getState().activeTimer).toMatchObject({ taskId: id, taskTitle: 'Read paper' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('⌥S で「時間を決める」を開く（閉じたあと、フォーカスが戻ってから）', async () => {
    const id = useTaskStore.getState().addTask('Read paper')!
    const user = await openPalette()
    await user.type(screen.getByRole('combobox'), 'paper')
    await user.keyboard('{Alt>}s{/Alt}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'before' })).toHaveFocus()
    await act(() => new Promise((r) => setTimeout(r, 0)))
    expect(useOverlays.getState().menu).toMatchObject({ kind: 'timeSlot', taskId: id, dateKey: toDateKey(appToday()) })
    useOverlays.setState({ menu: null })
  })

  it('下の段のボタンでも同じ操作ができる。使えない操作（完了済み）は出さない', async () => {
    const s = useTaskStore.getState()
    const id = s.addTask('Read paper')!
    s.toggleTask(id)
    const user = await openPalette()
    await user.type(screen.getByRole('combobox'), 'paper')
    expect(screen.queryByRole('button', { name: /Do today/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Start logging/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Details/ }))
    expect(useOverlays.getState().detailTaskId).toBe(id)
  })

  it('日本語の変換を確定する Enter（isComposing・keyCode 229）では詳細を開かない', async () => {
    useTaskStore.getState().addTask('レポート')
    useOverlays.setState({ detailTaskId: null })
    const user = await openPalette()
    const input = screen.getByRole('combobox')
    await user.type(input, 'レポート')

    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 })
    expect(useOverlays.getState().detailTaskId).toBeNull()
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 })
    expect(useOverlays.getState().detailTaskId).not.toBeNull()
  })
})
