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

  it('小タスクを段へ移すと親から外れ、親のすぐ後のルートの行になる。1 回の取り消しで戻る（#606）', () => {
    useTaskStore.setState({ tasks: [row('trip', { order: 0 }), row('picnic', { order: 1 }), row('step', { parentId: 'trip' })] })
    st().setSomedayTier(['step'], 'dream')
    expect(get('step')).toMatchObject({ parentId: null, somedayTier: 'dream' })
    const roots = st()
      .tasks.filter((t) => t.listId === 'wish' && !t.parentId)
      .sort((a, b) => a.order - b.order)
      .map((t) => t.id)
    expect(roots).toEqual(['trip', 'step', 'picnic'])
    st().undoLastOperation()
    expect(get('step').parentId).toBe('trip')
    st().setSomedayTier(['step'], 'wish')
    expect(get('step').parentId).toBeNull()
    expect('somedayTier' in get('step')).toBe(false)
  })

  it('いつかでは右ドラッグで直前の行の子にしない（#606）', () => {
    useTaskStore.setState({ tasks: [row('trip', { order: 0 }), row('picnic', { order: 1 })] })
    expect(st().indentTaskUnderPrevSibling('picnic')).toBe(false)
    expect(get('picnic').parentId).toBeNull()
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

  it('夢の一歩を予定にしても元の夢を覚え、夢の進み具合に数える（#430）', async () => {
    const { dreamSteps } = await import('../lib/somedayTier')
    st().setSomedayTier(['trip'], 'dream')
    st().promoteToPlanned('step', '2026-10-20')
    expect(get('step').parentId).toBeNull()
    expect(get('step').dreamId).toBe('trip')
    expect(dreamSteps(st().tasks, 'trip')).toMatchObject({ next: { id: 'step' }, done: 0, total: 1 })
    st().toggleTask('step')
    expect(dreamSteps(st().tasks, 'trip')).toMatchObject({ next: null, done: 1, total: 1 })
    // やりたいの子を予定にしても、つながりは付けない
    useTaskStore.setState({ tasks: [...st().tasks, row('sub', { parentId: 'picnic' })] })
    st().promoteToPlanned('sub', '2026-10-21')
    expect('dreamId' in get('sub')).toBe(false)
  })
})
