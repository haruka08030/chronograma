import { describe, expect, it } from 'vitest'
import { useTaskStore } from './taskStore'

const task = (id: string) => useTaskStore.getState().tasks.find((t) => t.id === id)!

describe('何も変えない書き込みは積まない', () => {
  it('同じ優先度を選び直しても、行も取り消しの履歴も変わらない', () => {
    const id = useTaskStore.getState().addTask('A')!
    useTaskStore.getState().updateTask(id, { priority: 'high' })
    const before = useTaskStore.getState().tasks
    useTaskStore.setState({ undoBanner: null })
    useTaskStore.getState().updateTask(id, { priority: 'high' }, { key: 'undo.blockMoved' })
    expect(useTaskStore.getState().tasks).toBe(before)
    expect(useTaskStore.getState().undoBanner).toBeNull()
    // ⌘Z 1 回で、その前の本当の変更（優先度を上げた）が戻る
    useTaskStore.getState().undoLastOperation()
    expect(task(id).priority).toBe('none')
  })

  it('同じ日へ付け替えても何もしない', () => {
    const id = useTaskStore.getState().addTask('A')!
    useTaskStore.getState().rescheduleTasks([id], '2026-10-05')
    const before = useTaskStore.getState().tasks
    useTaskStore.getState().rescheduleTasks([id], '2026-10-05', { key: 'undo.tasksMovedToToday', params: { count: 1 } })
    expect(useTaskStore.getState().tasks).toBe(before)
  })

  it('予定を外したときに消える時刻も含めて比べる（時刻だけ残っていれば変わる）', () => {
    const id = useTaskStore.getState().addTask('A')!
    useTaskStore.setState((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, scheduledDate: null, startTime: '09:00' } : t)) }))
    useTaskStore.getState().updateTask(id, { scheduledDate: null })
    expect(task(id).startTime).toBeNull()
  })

  it('同じリスト名・同じ色では積まない', () => {
    const s = useTaskStore.getState()
    s.addList('買い物', 'checklist')
    const list = useTaskStore.getState().lists.find((l) => l.name === '買い物')!
    const before = useTaskStore.getState().lists
    s.renameList(list.id, '買い物')
    s.updateListColor(list.id, list.color)
    s.setListKind(list.id, 'checklist')
    expect(useTaskStore.getState().lists).toBe(before)
  })
})

describe('メモを打つ間の取り消し', () => {
  it('続けて打った分は 1 回の取り消しで戻り、その前の操作も履歴に残る', () => {
    const id = useTaskStore.getState().addTask('A')!
    useTaskStore.getState().updateTask(id, { priority: 'high' })
    let text = ''
    for (const ch of 'あいうえおかきくけこ'.repeat(6)) {
      text += ch
      useTaskStore.getState().updateTask(id, { description: text })
    }
    useTaskStore.getState().undoLastOperation()
    expect(task(id).description).toBe('')
    expect(task(id).priority).toBe('high')
    useTaskStore.getState().undoLastOperation()
    expect(task(id).priority).toBe('none')
  })

  it('別の操作をはさむと、そのあとの打鍵は別の 1 回になる', () => {
    const id = useTaskStore.getState().addTask('A')!
    useTaskStore.getState().updateTask(id, { description: 'a' })
    useTaskStore.getState().updateTask(id, { priority: 'high' })
    useTaskStore.getState().updateTask(id, { description: 'ab' })
    useTaskStore.getState().undoLastOperation()
    expect(task(id).description).toBe('a')
    expect(task(id).priority).toBe('high')
  })
})
