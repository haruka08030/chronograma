import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_DEFAULTS } from '../lib/taskDefaults'
import type { Task } from '../types/task'

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

const task = (id: string, over: Partial<Task> = {}): Task =>
  ({
    ...TASK_DEFAULTS,
    id,
    title: id,
    description: '',
    completed: false,
    completedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    order: 0,
    listId: 'l',
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

const get = (id: string) => useTaskStore.getState().tasks.find((t) => t.id === id)!

beforeEach(() => {
  useTaskStore.setState({
    lists: [{ id: 'l', name: 'L', color: '#33B679', order: 0, kind: 'tasks' }],
    tasks: [
      task('shift', { kind: 'event', scheduledDate: '2026-10-06', startTime: '17:00', endTime: '22:00' }),
      task('report', { scheduledDate: '2026-10-06', startTime: '10:00', endTime: '11:00', dueDate: '2026-10-08' }),
    ],
  })
})

describe('予定（完了の丸の無いもの）', () => {
  it('完了にできない（丸・ショートカット・まとめて完了のどこから来ても）', () => {
    useTaskStore.getState().toggleTask('shift')
    useTaskStore.getState().completeTasks(['shift', 'report'])
    expect(get('shift')).toMatchObject({ completed: false, completedAt: null })
    expect(get('report').completed).toBe(true)
  })

  it('To-Do を予定にすると、締切・繰り返し・完了・優先度を外す（やる日・時間帯は残す）', () => {
    useTaskStore.setState((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === 'report'
          ? { ...t, completed: true, completedAt: '2026-10-06T02:00:00Z', priority: 'high', recurrence: { type: 'weekly', interval: 1 } }
          : t,
      ),
    }))
    useTaskStore.getState().updateTask('report', { kind: 'event' })
    expect(get('report')).toMatchObject({
      kind: 'event',
      dueDate: null,
      dueTime: null,
      recurrence: null,
      completed: false,
      completedAt: null,
      priority: 'none',
      scheduledDate: '2026-10-06',
      startTime: '10:00',
      endTime: '11:00',
    })
  })

  it('予定を To-Do に戻すと、また完了にできる', () => {
    useTaskStore.getState().updateTask('shift', { kind: 'todo' })
    useTaskStore.getState().toggleTask('shift')
    expect(get('shift')).toMatchObject({ kind: 'todo', completed: true })
  })

  it('予定から始めた記録を止めても、完了にするかは聞かない', () => {
    useTaskStore.setState({
      activeTimer: { taskId: 'shift', taskTitle: 'shift', startedAt: new Date(Date.now() - 30 * 60_000).toISOString(), tags: [] },
    })
    useTaskStore.getState().stopTimer()
    expect(useTaskStore.getState().completePromptTaskId).toBeNull()
  })
})
