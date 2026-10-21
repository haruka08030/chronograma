import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useTaskStore } from '../../store/taskStore'
import { TASK_DEFAULTS } from '../../lib/taskDefaults'
import type { Task } from '../../types/task'
import { TaskEstimateField } from './TaskEstimateField'

/** 見積もりを入れたときの「いつも◯倍かかっています」（#417） */

const base = (id: string, over: Partial<Task> = {}): Task =>
  ({
    ...TASK_DEFAULTS,
    id,
    title: id,
    description: '',
    completed: false,
    completedAt: null,
    createdAt: '2026-09-01T12:00:00Z',
    updatedAt: '2026-09-01T12:00:00Z',
    order: 0,
    listId: 'inbox',
    sectionId: null,
    parentId: null,
    dueDate: null,
    startTime: null,
    endTime: null,
    priority: 'none',
    tags: [],
    recurrence: null,
    ...over,
  }) as Task

/** 見積もり 60 分で 90 分かかった完了した To-Do を n 件 */
function history(n: number): Task[] {
  return Array.from({ length: n }, (_, i) => [
    base(`h${i}`, { completed: true, completedAt: '2026-10-07T12:00:00Z', estimateMinutes: 60 }),
    base(`h${i}-log`, { kind: 'log', dueDate: '2026-10-07', startTime: '09:00', endTime: '10:30', completed: true, sourceTaskId: `h${i}` }),
  ]).flat()
}

function Field({ id }: { id: string }) {
  const task = useTaskStore((s) => s.tasks.find((t) => t.id === id))!
  return <TaskEstimateField task={task} />
}

const estimateOf = (id: string) => useTaskStore.getState().tasks.find((t) => t.id === id)?.estimateMinutes

describe('TaskEstimateField: 見積もりのクセ', () => {
  beforeEach(() => useTaskStore.setState({ tasks: [] }))

  it('見積もりを選ぶと直した長さが出て、押すとその長さになり、消える', () => {
    useTaskStore.setState({ tasks: [...history(5), base('new')] })
    render(<Field id="new" />)
    expect(screen.queryByText(/1.5×/)).toBeNull()
    act(() => {
      fireEvent.change(screen.getByRole('combobox'), { target: { value: '60' } })
    })
    expect(screen.getByText('Things usually take 1.5× your estimate')).toBeInTheDocument()
    act(() => screen.getByRole('button', { name: 'Make it 1h 30m' }).click())
    expect(estimateOf('new')).toBe(90)
    expect(screen.queryByText(/1.5×/)).toBeNull()
  })

  it('記録が少ないうちは何も出さない', () => {
    useTaskStore.setState({ tasks: [...history(4), base('new')] })
    render(<Field id="new" />)
    act(() => {
      fireEvent.change(screen.getByRole('combobox'), { target: { value: '60' } })
    })
    expect(screen.queryByText(/your estimate/)).toBeNull()
  })

  it('開いただけ（もう入っている見積もり）には出さない', () => {
    useTaskStore.setState({ tasks: [...history(5), base('new', { estimateMinutes: 60 })] })
    render(<Field id="new" />)
    expect(screen.queryByText(/your estimate/)).toBeNull()
  })
})
