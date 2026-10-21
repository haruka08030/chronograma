import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_DEFAULTS } from '../lib/taskDefaults'

// ストアを node で読み込むための最小限の localStorage
beforeAll(() => {
  const mem = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  })
})
vi.mock('../i18n/config', () => ({
  default: { t: (k: string, o?: { returnObjects?: boolean }) => (o?.returnObjects ? [] : k), language: 'ja' },
}))

const { useTaskStore } = await import('./taskStore')
const OLD = '2026-01-01T00:00:00.000Z'

function task(id: string, title: string) {
  return {
    ...TASK_DEFAULTS,
    id,
    title,
    description: '',
    completed: false,
    completedAt: null,
    createdAt: OLD,
    updatedAt: OLD,
    order: 0,
    listId: '__inbox__',
    sectionId: null,
    parentId: null,
    dueDate: null,
    startTime: null,
    endTime: null,
    priority: 'none' as const,
    tags: [],
    recurrence: null,
  }
}
const titles = () =>
  useTaskStore
    .getState()
    .tasks.map((t) => t.title)
    .sort()
const tick = () => new Promise((r) => queueMicrotask(() => r(null)))

beforeEach(() => {
  useTaskStore.setState({ tasks: [task('a', 'A'), task('b', 'B')], recentDeletes: [], activeTimer: null })
  // 前のテストの履歴を残さない
  while (useTaskStore.getState().undoLastOperation()) {
    /* 空にする */
  }
})

describe('⌘Z は変えた行だけを戻す', () => {
  it('操作のあとに同期で届いた行は消さない', async () => {
    useTaskStore.getState().updateTask('a', { title: 'A2' })
    await tick()
    // 同期で他の端末のタスクが届く
    useTaskStore.setState((s) => ({ tasks: [...s.tasks, task('r', 'Remote')] }))
    expect(useTaskStore.getState().undoLastOperation()).toBe(true)
    expect(titles()).toEqual(['A', 'B', 'Remote'])
  })

  it('戻した行は updatedAt を付け直す（次の同期で負けない）', async () => {
    useTaskStore.getState().updateTask('a', { title: 'A2' })
    await tick()
    useTaskStore.getState().undoLastOperation()
    const a = useTaskStore.getState().tasks.find((t) => t.id === 'a')!
    expect(a.title).toBe('A')
    expect(a.updatedAt > OLD).toBe(true)
    // 触っていない行の時刻は変えない
    expect(useTaskStore.getState().tasks.find((t) => t.id === 'b')!.updatedAt).toBe(OLD)
  })

  it('削除を取り消すと戻り、削除のトーストの一覧からも外れる', async () => {
    useTaskStore.getState().deleteTasks(['a'])
    await tick()
    expect(useTaskStore.getState().recentDeletes).toHaveLength(1)
    useTaskStore.getState().undoLastOperation()
    expect(useTaskStore.getState().tasks.find((t) => t.id === 'a')!.deletedAt ?? null).toBeNull()
    expect(useTaskStore.getState().recentDeletes).toHaveLength(0)
  })

  it('作ったタスクを取り消すと消え、やり直すと戻る', async () => {
    useTaskStore.getState().addTask('C', '__inbox__')
    await tick()
    expect(titles()).toEqual(['A', 'B', 'C'])
    useTaskStore.getState().undoLastOperation()
    expect(titles()).toEqual(['A', 'B'])
    useTaskStore.getState().redoLastOperation()
    expect(titles()).toEqual(['A', 'B', 'C'])
  })

  it('記録中のタイマーと見ている画面は ⌘Z で変えない', async () => {
    useTaskStore.getState().updateTask('a', { title: 'A2' })
    await tick()
    const timer = { taskId: 'b', taskTitle: 'B', startedAt: new Date().toISOString() }
    useTaskStore.setState({ activeTimer: timer as never, selectedView: 'calendar' })
    useTaskStore.getState().undoLastOperation()
    expect(useTaskStore.getState().activeTimer).toEqual(timer)
    expect(useTaskStore.getState().selectedView).toBe('calendar')
    expect(titles()).toEqual(['A', 'B'])
  })

  it('まとめた操作は 1 回で戻る', async () => {
    useTaskStore.getState().completeTasks(['a', 'b'])
    await tick()
    expect(useTaskStore.getState().tasks.every((t) => t.completed)).toBe(true)
    useTaskStore.getState().undoLastOperation()
    expect(useTaskStore.getState().tasks.every((t) => !t.completed)).toBe(true)
  })
})

describe('トーストは自分の操作だけを戻す（undoOperation）', () => {
  const get = (id: string) => useTaskStore.getState().tasks.find((t) => t.id === id)!

  it('削除→別の操作→削除のトーストで、削除だけが戻る', async () => {
    useTaskStore.getState().deleteTasks(['a'])
    await tick()
    const undoId = useTaskStore.getState().recentDeletes[0].undoId!
    useTaskStore.getState().updateTask('b', { title: 'B2' })
    await tick()
    expect(useTaskStore.getState().undoOperation(undoId)).toBe(true)
    expect(get('a').deletedAt ?? null).toBeNull()
    expect(get('b').title).toBe('B2')
    expect(useTaskStore.getState().recentDeletes).toHaveLength(0)
    // 残った操作は ⌘Z でいつもどおり戻る。戻した操作は 2 度戻さない
    expect(useTaskStore.getState().undoOperation(undoId)).toBe(false)
    expect(useTaskStore.getState().undoLastOperation()).toBe(true)
    expect(get('b').title).toBe('B')
  })

  it('ラベル付きの操作はトーストに番号が付き、その操作だけを戻す', async () => {
    useTaskStore.getState().archiveTasks(['a'])
    await tick()
    const undoId = useTaskStore.getState().undoBanner!.undoId!
    useTaskStore.getState().updateTask('b', { title: 'B2' })
    await tick()
    useTaskStore.getState().undoOperation(undoId)
    expect(get('a').archivedAt ?? null).toBeNull()
    expect(get('b').title).toBe('B2')
  })

  it('あとの操作も同じ行を変えていたら、その操作が変えた項目だけを戻す', async () => {
    useTaskStore.getState().updateTask('a', { title: 'A2' })
    await tick()
    const id = useTaskStore.getState().lastUndoId()!
    useTaskStore.getState().updateTask('a', { description: 'メモ' })
    await tick()
    useTaskStore.getState().undoOperation(id)
    expect(get('a').title).toBe('A')
    expect(get('a').description).toBe('メモ')
    // あとの操作を戻しても、先に戻した題名は戻ってこない
    useTaskStore.getState().undoLastOperation()
    expect(get('a').title).toBe('A')
    expect(get('a').description).toBe('')
  })
})
