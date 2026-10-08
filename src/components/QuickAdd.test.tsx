import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { INBOX_ID } from '../store/storeConstants'
import { taskTimedInterval } from '../lib/taskTimeRange'
import { QuickAdd } from './QuickAdd'

const tasks = () => useTaskStore.getState().tasks

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {}
})

describe('QuickAdd', () => {
  it('書いて Enter でタスクが増え、欄は空に戻る', async () => {
    const user = userEvent.setup()
    render(<QuickAdd />)
    const input = screen.getByPlaceholderText('Add a to-do')

    await user.type(input, 'Buy milk{Enter}')

    expect(tasks()).toHaveLength(1)
    expect(tasks()[0]).toMatchObject({ title: 'Buy milk', completed: false, parentId: null })
    expect(input).toHaveValue('')
  })

  it('空のまま Enter では増えない', async () => {
    const user = userEvent.setup()
    render(<QuickAdd />)
    await user.type(screen.getByPlaceholderText('Add a to-do'), '   {Enter}')
    expect(tasks()).toHaveLength(0)
  })

  it('時刻を読み取って題名から外す（To-Do に入る）', async () => {
    const user = userEvent.setup()
    render(<QuickAdd />)

    await user.type(screen.getByPlaceholderText('Add a to-do'), 'Standup 9:00-9:30{Enter}')

    const [task] = tasks()
    expect(task.title).toBe('Standup')
    expect(task.listId).toBe(INBOX_ID)
    expect(task.startTime).toBe('09:00')
    expect(task.endTime).toBe('09:30')
  })

  it('入力中だけ、読み取った締切・予定を欄の下に 1 行で出す', async () => {
    const user = userEvent.setup()
    render(<QuickAdd />)
    const input = screen.getByPlaceholderText('Add a to-do')

    await user.type(input, 'Essay')
    // 何も読み取れないうちは出さない
    expect(screen.queryByText(/^Due /)).toBeNull()

    await user.type(input, ' due 10/10')
    expect(screen.getByText(/^Due \w{3} 10\/10$/)).toBeInTheDocument()

    await user.type(input, '{Enter}')
    expect(screen.queryByText(/^Due /)).toBeNull()
  })

  it('@リスト で買い物などのリストへ入れる', async () => {
    useTaskStore.getState().addList('Shop', 'checklist')
    const shop = useTaskStore.getState().lists.find((l) => l.name === 'Shop')!.id
    const user = userEvent.setup()
    render(<QuickAdd />)

    await user.type(screen.getByPlaceholderText('Add a to-do'), 'Milk @Shop{Enter}')

    const [task] = tasks()
    expect(task.title).toBe('Milk')
    expect(task.listId).toBe(shop)
  })

  it('時間チップで遅い開始（23:00）を入れても終わりはその日の中で、足した To-Do はタイムラインに出る', async () => {
    useTaskStore.setState({ defaultBlockMinutes: 120 })
    const user = userEvent.setup()
    render(<QuickAdd />)
    const input = screen.getByPlaceholderText('Add a to-do')

    await user.type(input, 'ES')
    await user.click(screen.getByRole('button', { name: 'Time' }))
    await user.type(screen.getByRole('combobox', { name: 'Start' }), '23:00{Enter}')
    await user.click(screen.getByRole('button', { name: 'Done' }))
    await user.type(input, '{Enter}')

    const [task] = tasks()
    expect(task).toMatchObject({ title: 'ES', startTime: '23:00', endTime: '23:59' })
    expect(taskTimedInterval(task)).not.toBeNull()
  })

  it('共有（share_target）から開くと中身が欄に入るだけで、確かめて Enter するまで足さない', async () => {
    useTaskStore.getState().requestQuickAdd({ text: 'Entry https://example.com/e', note: '' })
    const user = userEvent.setup()
    render(<QuickAdd />)
    const input = screen.getByPlaceholderText('Add a to-do')

    await waitFor(() => expect(input).toHaveValue('Entry https://example.com/e'))
    expect(input).toHaveFocus()
    expect(tasks()).toHaveLength(0)
    expect(useTaskStore.getState()).toMatchObject({ quickAddRequested: false, quickAddPrefill: null })

    await user.type(input, '{Enter}')
    expect(tasks()).toHaveLength(1)
    expect(tasks()[0]).toMatchObject({ title: 'Entry', description: 'https://example.com/e' })
    expect(input).toHaveValue('')
  })

  it('共有の長い本文はメモに入ると知らせ、足すとメモの先頭に入る。欄を空にしたら本文も捨てる', async () => {
    const user = userEvent.setup()
    useTaskStore.getState().requestQuickAdd({ text: 'Article https://example.com/a', note: 'Long body' })
    const { unmount } = render(<QuickAdd />)
    const input = screen.getByPlaceholderText('Add a to-do')
    expect(await screen.findByText('The shared text goes into the note')).toBeInTheDocument()

    await user.type(input, '{Enter}')
    expect(tasks()[0]).toMatchObject({ title: 'Article', description: 'Long body\nhttps://example.com/a' })
    expect(screen.queryByText('The shared text goes into the note')).toBeNull()
    unmount()

    useTaskStore.getState().requestQuickAdd({ text: 'Other', note: 'Dropped' })
    render(<QuickAdd />)
    const again = screen.getByPlaceholderText('Add a to-do')
    await waitFor(() => expect(again).toHaveValue('Other'))
    await user.clear(again)
    await user.type(again, 'Fresh{Enter}')
    expect(tasks().find((t) => t.title === 'Fresh')?.description).toBe('')
  })

  it('URL を貼っただけでも、題名から外してメモに入れる（iPhone は共有先に出ないのでこの道）', async () => {
    const user = userEvent.setup()
    render(<QuickAdd />)
    const input = screen.getByPlaceholderText('Add a to-do')
    await user.click(input)
    await user.paste('Info session https://example.com/2026/10/15/')
    await user.type(input, '{Enter}')
    expect(tasks()[0]).toMatchObject({ title: 'Info session', description: 'https://example.com/2026/10/15/', scheduledDate: null })
  })
})
