import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { QuickAdd } from './QuickAdd'

const tasks = () => useTaskStore.getState().tasks

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

  it('時刻と @リスト を読み取って題名から外す', async () => {
    useTaskStore.getState().addList('Work')
    const work = useTaskStore.getState().lists.find((l) => l.name === 'Work')!.id
    const user = userEvent.setup()
    render(<QuickAdd />)

    await user.type(screen.getByPlaceholderText('Add a to-do'), 'Standup 9:00-9:30 @Work{Enter}')

    const [task] = tasks()
    expect(task.title).toBe('Standup')
    expect(task.listId).toBe(work)
    expect(task.startTime).toBe('09:00')
    expect(task.endTime).toBe('09:30')
  })
})
