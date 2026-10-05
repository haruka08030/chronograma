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

const { useTaskStore, recurrenceNextId } = await import('./taskStore')

describe('繰り返しタスクの次回', () => {
  const setup = () => {
    const now = new Date().toISOString()
    useTaskStore.setState({
      tasks: [
        {
          ...TASK_DEFAULTS,
          id: 'gym',
          title: 'ジム',
          description: '',
          completed: false,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
          order: 0,
          listId: '__inbox__',
          sectionId: null,
          parentId: null,
          dueDate: '2026-10-02',
          startTime: null,
          endTime: null,
          priority: 'none',
          tags: [],
          recurrence: { type: 'weekly', interval: 1 },
        },
      ],
    })
  }
  const ids = () =>
    useTaskStore
      .getState()
      .tasks.map((t) => t.id)
      .sort()

  it('完了 → 戻す → 完了 でも次回は 1 つ', () => {
    setup()
    const { toggleTask } = useTaskStore.getState()
    toggleTask('gym')
    toggleTask('gym')
    expect(ids()).toEqual(['gym'])
    toggleTask('gym')
    expect(ids()).toEqual(['gym', 'gym@2026-10-09'])
  })

  it('次回を完了すると、その次は元の id に日付を付ける（id が伸び続けない）', () => {
    setup()
    const { toggleTask } = useTaskStore.getState()
    toggleTask('gym')
    toggleTask('gym@2026-10-09')
    expect(ids()).toEqual(['gym', 'gym@2026-10-09', 'gym@2026-10-16'])
    expect(recurrenceNextId('gym@2026-10-09', '2026-10-16')).toBe('gym@2026-10-16')
  })

  it('手を付けた次回は、完了を戻しても消さない', () => {
    setup()
    const { toggleTask, updateTask } = useTaskStore.getState()
    vi.useFakeTimers({ now: new Date('2026-10-02T09:00:00Z') })
    toggleTask('gym')
    vi.setSystemTime(new Date('2026-10-02T09:05:00Z'))
    updateTask('gym@2026-10-09', { title: 'ジム（脚）' })
    vi.useRealTimers()
    toggleTask('gym')
    expect(ids()).toEqual(['gym', 'gym@2026-10-09'])
  })
})
