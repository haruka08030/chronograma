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
const { migrateTaskState } = await import('./migrate')
const st = () => useTaskStore.getState()
const get = (id: string) => st().tasks.find((t) => t.id === id)!

const now = '2026-01-01T00:00:00.000Z'
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
  listId: 'wish',
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
  useTaskStore.setState({
    lists: [...st().lists, { id: 'wish', name: 'いつか', color: '#000000', order: 9, kind: 'someday' }],
    tasks: [row('trip'), row('picnic'), row('step', { parentId: 'trip' })],
  })
})

describe('いつかの段（#221）', () => {
  it('夢へ移す・やりたいへ戻すは 1 回の取り消しで戻る。一歩（子）には段を付けない', () => {
    st().setSomedayTier(['trip', 'step'], 'dream')
    expect(get('trip').somedayTier).toBe('dream')
    expect('somedayTier' in get('step')).toBe(false)
    st().setSomedayTier(['trip'], 'wish')
    expect('somedayTier' in get('trip')).toBe(false)
    st().undoLastOperation()
    expect(get('trip').somedayTier).toBe('dream')
  })

  it('ほかのリストへ移す・予定にすると夢の段は外れる', () => {
    st().setSomedayTier(['trip', 'picnic'], 'dream')
    st().updateTask('picnic', { listId: '__inbox__' })
    expect('somedayTier' in get('picnic')).toBe(false)
    st().promoteToPlanned('trip', '2026-10-20')
    expect('somedayTier' in get('trip')).toBe(false)
  })

  it('前の版（41 より前）の保存データは、一歩を持つ行を夢にする（updatedAt は変えない）', () => {
    const out = migrateTaskState(
      {
        tasks: [row('trip'), row('step', { parentId: 'trip' }), row('picnic')],
        lists: [{ id: 'wish', kind: 'someday' }],
        sections: [],
        habits: [],
      },
      40,
    )
    expect(out.tasks.map((t) => t.somedayTier ?? null)).toEqual(['dream', null, null])
    expect(out.tasks[0]!.updatedAt).toBe(now)
  })
})
