import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { TaskItem } from './TaskItem'

function addTask(title: string) {
  const id = useTaskStore.getState().addTask(title)!
  return useTaskStore.getState().tasks.find((t) => t.id === id)!
}

/** 行はストアの最新のタスクで描く（一覧と同じ） */
function Row({ id }: { id: string }) {
  const task = useTaskStore((s) => s.tasks.find((t) => t.id === id))
  return task ? <TaskItem task={task} /> : null
}

describe('TaskItem', () => {
  it('完了の丸を押すとタスクが完了になる', async () => {
    const task = addTask('Write report')
    const user = userEvent.setup()
    render(<Row id={task.id} />)

    await user.click(screen.getByRole('button', { name: 'Mark complete' }))

    // 押した直後から完了の見た目にし、少し置いてからストアを完了にする
    await waitFor(() => expect(useTaskStore.getState().tasks.find((t) => t.id === task.id)?.completed).toBe(true))
    expect(screen.getByRole('button', { name: 'Mark incomplete' })).toBeInTheDocument()
  })

  it('完了の丸をもう一度押すと未完了に戻る', async () => {
    const task = addTask('Call mom')
    useTaskStore.getState().toggleTask(task.id)
    const user = userEvent.setup()
    render(<Row id={task.id} />)

    await user.click(screen.getByRole('button', { name: 'Mark incomplete' }))

    expect(useTaskStore.getState().tasks.find((t) => t.id === task.id)?.completed).toBe(false)
  })
})
