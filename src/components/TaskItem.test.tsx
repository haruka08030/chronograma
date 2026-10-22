import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { refreshAppClock } from '../lib/appClock'
import { useTaskStore } from '../store/taskStore'
import { TaskItem } from './TaskItem'

function addTask(title: string) {
  const id = useTaskStore.getState().addTask(title)!
  return useTaskStore.getState().tasks.find((t) => t.id === id)!
}

/** 行はストアの最新のタスクで描く（一覧と同じ） */
function Row({ id, showChildDue }: { id: string; showChildDue?: boolean }) {
  const task = useTaskStore((s) => s.tasks.find((t) => t.id === id))
  return task ? <TaskItem task={task} showChildDue={showChildDue} /> : null
}

describe('TaskItem', () => {
  it('完了の丸を押すとタスクが完了になる', async () => {
    const task = addTask('Write report')
    const user = userEvent.setup()
    render(<Row id={task.id} />)

    const check = screen.getByRole('checkbox', { name: 'Complete “Write report”' })
    expect(check).toHaveAttribute('aria-checked', 'false')
    await user.click(check)

    // 押した直後から完了の見た目にし、少し置いてからストアを完了にする
    await waitFor(() => expect(useTaskStore.getState().tasks.find((t) => t.id === task.id)?.completed).toBe(true), {
      timeout: 3000,
    })
    expect(screen.getByRole('checkbox', { name: 'Complete “Write report”' })).toHaveAttribute('aria-checked', 'true')
  })

  it('完了の丸をもう一度押すと未完了に戻る', async () => {
    const task = addTask('Call mom')
    useTaskStore.getState().toggleTask(task.id)
    const user = userEvent.setup()
    render(<Row id={task.id} />)

    await user.click(screen.getByRole('checkbox', { name: 'Complete “Call mom”', checked: true }))

    expect(useTaskStore.getState().tasks.find((t) => t.id === task.id)?.completed).toBe(false)
  })

  it('予定（バイト・授業）の行には完了の丸を出さない', () => {
    const task = addTask('Part-time job')
    useTaskStore.getState().updateTask(task.id, { kind: 'event', scheduledDate: '2026-10-06', startTime: '17:00', endTime: '22:00' })
    render(<Row id={task.id} />)

    expect(screen.queryByRole('checkbox', { name: 'Complete “Part-time job”' })).toBeNull()
    expect(screen.getByText('Part-time job')).toBeInTheDocument()
  })
})

describe('TaskItem: 題名を押す（#378）', () => {
  function RowWithClick({ id, onRowClick }: { id: string; onRowClick?: () => void }) {
    const task = useTaskStore((s) => s.tasks.find((t) => t.id === id))
    return task ? <TaskItem task={task} onRowClick={onRowClick} /> : null
  }

  it('題名を押すと行と同じ動き（詳細）で、名前の変更には入らない', async () => {
    const task = addTask('Write report')
    const onRowClick = vi.fn()
    const user = userEvent.setup()
    render(<RowWithClick id={task.id} onRowClick={onRowClick} />)

    await user.click(screen.getByRole('button', { name: 'Write report' }))

    await waitFor(() => expect(onRowClick).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('textbox', { name: 'Edit title' })).toBeNull()
  })

  it('題名を押したら待たずに開く', async () => {
    const task = addTask('Write report')
    const onRowClick = vi.fn()
    const user = userEvent.setup()
    render(<RowWithClick id={task.id} onRowClick={onRowClick} />)

    await user.click(screen.getByRole('button', { name: 'Write report' }))

    expect(onRowClick).toHaveBeenCalledTimes(1)
  })

  it('題名にフォーカスして F2 で名前の変更', async () => {
    const task = addTask('Write report')
    const user = userEvent.setup()
    render(<RowWithClick id={task.id} onRowClick={() => {}} />)

    screen.getByRole('button', { name: 'Write report' }).focus()
    await user.keyboard('{F2}')

    expect(screen.getByRole('textbox', { name: 'Edit title' })).toHaveValue('Write report')
  })

  it('行に動きが無い所（詳細のサブタスク）は題名を押すと名前の変更', async () => {
    const task = addTask('Step 1')
    const user = userEvent.setup()
    render(<Row id={task.id} />)

    await user.click(screen.getByRole('button', { name: 'Step 1' }))

    expect(screen.getByRole('textbox', { name: 'Edit title' })).toBeInTheDocument()
  })
})

describe('TaskItem: 親の行の次の締切（#308）', () => {
  it('子の行が見えない所（showChildDue）で、まだ終わっていない子のいちばん近い締切を出し、全部済めば出さない', () => {
    const parent = addTask('A Inc.')
    const store = useTaskStore.getState()
    const es = store.addTask('ES', undefined, parent.id)!
    const interview = store.addTask('Interview', undefined, parent.id)!
    useTaskStore.getState().updateTask(es, { dueDate: '2099-10-15' })
    useTaskStore.getState().updateTask(interview, { dueDate: '2099-10-20' })
    // To-Do 一覧（子がすぐ下に並ぶ）では出さない
    const first = render(<Row id={parent.id} />)
    expect(document.querySelector('[data-child-due]')).toBeNull()
    first.unmount()
    const { unmount } = render(<Row id={parent.id} showChildDue />)
    const chip = document.querySelector('[data-child-due]')!
    expect(chip.getAttribute('data-child-due')).toBe(es)
    expect(chip.textContent).toContain('ES')
    unmount()
    useTaskStore.getState().toggleTask(es)
    useTaskStore.getState().toggleTask(interview)
    render(<Row id={parent.id} showChildDue />)
    expect(document.querySelector('[data-child-due]')).toBeNull()
  })
})

describe('TaskItem: 子の進み具合', () => {
  it('子のある行は題名の右に「済/全部」。消した・アーカイブした子は数えない', () => {
    const parent = addTask('Curry')
    const add = (title: string) => {
      const c = addTask(title)
      useTaskStore.getState().updateTask(c.id, { parentId: parent.id })
      return c
    }
    const onion = add('Onion')
    add('Carrot')
    add('Pork')
    const gone = add('Old')
    const shelved = add('Shelved')
    useTaskStore.getState().toggleTask(onion.id)
    useTaskStore.getState().deleteTasks([gone.id])
    useTaskStore.getState().archiveTask(shelved.id)
    render(<Row id={parent.id} />)

    const title = screen.getByText('Curry').closest('[data-task-title]')!
    expect(title).toHaveTextContent('Curry1/3')
  })

  it('子の無い行には出さない', () => {
    const task = addTask('Solo')
    render(<Row id={task.id} />)
    expect(screen.getByText('Solo').closest('[data-task-title]')).toHaveTextContent(/^Solo$/)
  })
})

describe('TaskItem: 開いたまま 0 時をまたぐ', () => {
  afterEach(() => {
    vi.useRealTimers()
    refreshAppClock()
  })

  it('実行日が今日の行は、描き直すと「今日」でなく日付になる', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 21, 23, 58))
    refreshAppClock()
    const task = addTask('Report')
    useTaskStore.getState().updateTask(task.id, { scheduledDate: '2026-10-21', startTime: '10:00', endTime: '11:00' })
    const { container } = render(<Row id={task.id} />)
    expect(container).toHaveTextContent('Today 10:00–11:00')

    vi.setSystemTime(new Date(2026, 9, 22, 0, 2))
    act(() => refreshAppClock())
    expect(container).not.toHaveTextContent('Today')
    expect(container).toHaveTextContent('10/21')
  })
})
