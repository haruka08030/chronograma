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
const st = () => useTaskStore.getState()
const get = (id: string) => st().tasks.find((t) => t.id === id)!

const now = '2026-01-01T00:00:00.000Z'
const earlier = '2025-12-31T00:00:00.000Z'
const row = (id: string, over: Record<string, unknown> = {}) => ({
  ...TASK_DEFAULTS,
  id,
  title: id,
  description: '',
  completed: false,
  completedAt: null,
  createdAt: now,
  updatedAt: now,
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
  ...over,
})

beforeEach(() => {
  st().resetLocalData()
})

describe('親を戻すと、一緒に入れた子だけ戻る（#611）', () => {
  it('ゴミ箱: 先に別に消した小タスク（とその下）は残る', () => {
    useTaskStore.setState({
      tasks: [
        row('trip'),
        row('pack', { parentId: 'trip' }),
        row('passport', { parentId: 'trip', deletedAt: earlier }),
        row('photo', { parentId: 'passport', deletedAt: earlier }),
      ],
    })
    st().deleteTasks(['trip'])
    expect(get('pack').deletedAt).toBe(get('trip').deletedAt)
    expect(get('passport').deletedAt).toBe(earlier)
    st().restoreDeletedTasks(['trip'])
    expect(get('trip').deletedAt).toBeNull()
    expect(get('pack').deletedAt).toBeNull()
    expect(get('passport').deletedAt).toBe(earlier)
    expect(get('photo').deletedAt).toBe(earlier)
    // 残った小タスクを戻すと、その下の一緒に消したものも戻る
    st().restoreDeletedTasks(['passport'])
    expect(get('passport').deletedAt).toBeNull()
    expect(get('photo').deletedAt).toBeNull()
  })

  it('アーカイブ: 先に別にアーカイブした小タスクは残る', () => {
    useTaskStore.setState({
      tasks: [row('trip'), row('pack', { parentId: 'trip' }), row('passport', { parentId: 'trip', archivedAt: earlier })],
    })
    st().archiveTasks(['trip'])
    st().unarchiveTasks(['trip'])
    expect(get('trip').archivedAt).toBeNull()
    expect(get('pack').archivedAt).toBeNull()
    expect(get('passport').archivedAt).toBe(earlier)
  })
})
