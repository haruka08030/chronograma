import { beforeAll, describe, expect, it, vi } from 'vitest'
import { TASK_DEFAULTS } from '../lib/taskDefaults'
import { asIncomingChange } from '../lib/changeOrigin'
import { INBOX_ID } from './storeConstants'

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

describe('To-Do のフォルダを畳む（ストア）', () => {
  it('同期で届いたフォルダもラベルに畳み、開いていたら「すべて」へ', async () => {
    const now = new Date().toISOString()
    asIncomingChange(() =>
      useTaskStore.setState({
        lists: [
          { id: INBOX_ID, name: '', color: '#7986CB', order: 0, kind: 'tasks' },
          { id: 'f', name: 'ゼミ', color: '#33B679', order: 1, kind: 'tasks' },
        ],
        tasks: [
          {
            ...TASK_DEFAULTS,
            id: 't',
            title: '発表準備',
            description: '',
            completed: false,
            completedAt: null,
            createdAt: now,
            updatedAt: now,
            order: 0,
            listId: 'f',
            sectionId: null,
            parentId: null,
            dueDate: null,
            startTime: null,
            endTime: null,
            priority: 'none',
            tags: [],
            recurrence: null,
          },
        ],
        timeLogTagPresets: [],
        logCategoryColors: {},
        logLabelsUpdatedAt: null,
        selectedListId: 'f',
        selectedView: null,
      }),
    )
    await Promise.resolve()
    const s = useTaskStore.getState()
    expect(s.lists.map((l) => l.id)).toEqual([INBOX_ID])
    expect(s.tasks[0]).toMatchObject({ listId: INBOX_ID, color: '#33B679' })
    expect(s.timeLogTagPresets).toEqual(['ゼミ'])
    // 畳んで作ったラベルは「無ければ足す」だけ送る。ラベル表の時刻は進めない（ほかの端末のラベルの編集を上書きしない、#357）
    expect(s.logLabelsUpdatedAt).toBeNull()
    expect(s.logLabelPendingAdds).toEqual(['ゼミ'])
    expect(s).toMatchObject({ selectedView: 'all', selectedListId: null })
  })
})
