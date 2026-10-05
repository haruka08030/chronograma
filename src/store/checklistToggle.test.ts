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

const setup = (kind: 'tasks' | 'checklist') => {
  const now = new Date().toISOString()
  const base = {
    ...TASK_DEFAULTS,
    description: '',
    completed: false,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    order: 0,
    listId: 'l',
    sectionId: null,
    dueDate: null,
    startTime: null,
    endTime: null,
    priority: 'none' as const,
    tags: [],
    recurrence: null,
  }
  useTaskStore.setState({
    lists: [{ id: 'l', name: 'L', color: '#33B679', order: 0, kind }],
    tasks: [
      { ...base, id: 'curry', title: 'カレー', parentId: null },
      { ...base, id: 'onion', title: '玉ねぎ', parentId: 'curry' },
      { ...base, id: 'carrot', title: 'にんじん', parentId: 'curry' },
    ],
  })
}
const done = () =>
  useTaskStore
    .getState()
    .tasks.filter((t) => t.completed)
    .map((t) => t.id)
    .sort()

describe('完了の切り替えはリストの種類で変わる', () => {
  it('チェックリスト: 子がそろうと親も済み', () => {
    setup('checklist')
    useTaskStore.getState().toggleTask('onion')
    useTaskStore.getState().toggleTask('carrot')
    expect(done()).toEqual(['carrot', 'curry', 'onion'])
  })

  it('チェックリスト: 親と子を一緒に完了しても子が戻らない', () => {
    setup('checklist')
    useTaskStore.getState().completeTasks(['curry', 'onion'])
    expect(done()).toEqual(['carrot', 'curry', 'onion'])
  })

  it('To-Do: 子を全部済ませても親はそのまま', () => {
    setup('tasks')
    useTaskStore.getState().toggleTask('onion')
    useTaskStore.getState().toggleTask('carrot')
    expect(done()).toEqual(['carrot', 'onion'])
  })
})
