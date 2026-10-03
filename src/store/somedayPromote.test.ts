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

describe('いつかの子を予定にする', () => {
  it('親から外して未分類の 1 件にする（親は残る）', () => {
    const now = new Date().toISOString()
    const base = {
      ...TASK_DEFAULTS,
      description: '', completed: false, completedAt: null, createdAt: now, updatedAt: now, order: 0,
      listId: 'wish', sectionId: null, dueDate: null, startTime: null, endTime: null, priority: 'none' as const, tags: [], recurrence: null,
    }
    useTaskStore.setState({
      tasks: [
        { ...base, id: 'zh', title: '中国語', parentId: null },
        { ...base, id: 'hsk', title: 'HSK 合格', parentId: 'zh' },
      ],
    })
    useTaskStore.getState().promoteToPlanned('hsk', '2026-10-10')
    const byId = new Map(useTaskStore.getState().tasks.map((t) => [t.id, t]))
    expect(byId.get('hsk')).toMatchObject({ listId: '__inbox__', parentId: null, scheduledDate: '2026-10-10' })
    expect(byId.get('zh')).toMatchObject({ listId: 'wish', parentId: null })
  })
})
