import { beforeAll, describe, expect, it, vi } from 'vitest'
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
const { movedToDateLabel } = await import('../lib/moveToast')

const now = new Date().toISOString()
const base = {
  ...TASK_DEFAULTS,
  description: '', completed: false, completedAt: null, createdAt: now, updatedAt: now, order: 0,
  listId: 'l', sectionId: null, dueDate: null, startTime: null, endTime: null, priority: 'none' as const, tags: [], recurrence: null, parentId: null,
}
const setup = () =>
  useTaskStore.setState({
    lists: [{ id: 'l', name: 'L', color: '#33B679', order: 0, kind: 'tasks' }],
    tasks: [{ ...base, id: 'es', title: 'ES 書く' }, { ...base, id: 'gym', title: 'ジム' }],
    undoBanner: null,
  })
const banner = () => useTaskStore.getState().undoBanner?.text

describe('画面から取り消せるように、トーストを出す', () => {
  it('1 件の完了は題名つき。完了を外すときは出さない', () => {
    setup()
    useTaskStore.getState().toggleTask('es')
    expect(banner()).toEqual({ key: 'undo.taskCompleted', params: { title: 'ES 書く' } })
    useTaskStore.setState({ undoBanner: null })
    useTaskStore.getState().toggleTask('es')
    expect(banner()).toBeUndefined()
  })

  it('まとめて完了は件数、1 件なら題名', () => {
    setup()
    useTaskStore.getState().completeTasks(['es', 'gym'])
    expect(banner()).toMatchObject({ key: 'undo.tasksCompleted', params: { count: 2 } })
    setup()
    useTaskStore.getState().completeTasks(['gym'])
    expect(banner()).toEqual({ key: 'undo.taskCompleted', params: { title: 'ジム' } })
  })

  it('updateTask に渡した文が出る', () => {
    setup()
    useTaskStore.getState().updateTask('es', { startTime: '15:00', endTime: '16:00' }, { key: 'undo.blockResized', params: { title: 'ES 書く', time: '15:00–16:00' } })
    expect(banner()).toMatchObject({ key: 'undo.blockResized' })
  })

  it('別の日へ動かした文: 1 件は題名、複数は件数', () => {
    const tasks = [{ id: 'es', title: 'ES 書く' }]
    expect(movedToDateLabel(['es'], tasks, '2026-10-04')).toEqual({ key: 'undo.taskMovedToDate', params: { title: 'ES 書く', date: '10/4' } })
    expect(movedToDateLabel(['es', 'x'], tasks, '2026-10-04')).toEqual({ key: 'undo.tasksMovedToDate', params: { count: 2, date: '10/4' } })
  })
})
