import { beforeAll, describe, expect, it, vi } from 'vitest'

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
const { withTaskDefaults } = await import('../lib/taskDefaults')
const { TASK_DEFAULTS } = await import('../lib/taskDefaults')
const OLD = '2026-01-01T00:00:00.000Z'

const log = (id: string, patch: Record<string, unknown> = {}) => ({
  ...TASK_DEFAULTS,
  id,
  title: id,
  description: '',
  completed: true,
  completedAt: OLD,
  createdAt: OLD,
  updatedAt: OLD,
  order: 0,
  listId: '__inbox__',
  sectionId: null,
  parentId: null,
  dueDate: '2026-10-01',
  startTime: '10:00',
  endTime: '11:00',
  priority: 'none' as const,
  tags: [] as string[],
  recurrence: null,
  kind: 'log' as const,
  ...patch,
})

describe('記録の分類（category）', () => {
  it('前の版の保存（tags の先頭が分類）を読むと category になり、tags にも写す', () => {
    const t = withTaskDefaults({ ...log('a', { tags: ['授業'] }), category: undefined } as never)
    expect(t).toMatchObject({ category: '授業', tags: ['授業'] })
  })

  it('分類を選ぶと category と tags の両方が変わる（前の版の端末も読める）', () => {
    useTaskStore.setState({ tasks: [log('a', { category: '授業', tags: ['授業'] })] })
    useTaskStore.getState().updateTask('a', { category: 'バイト' })
    expect(useTaskStore.getState().tasks[0]).toMatchObject({ category: 'バイト', tags: ['バイト'] })
    // 前の書き方（tags）で選んでも category になる
    useTaskStore.getState().updateTask('a', { tags: ['ジム'] })
    expect(useTaskStore.getState().tasks[0]).toMatchObject({ category: 'ジム', tags: ['ジム'] })
  })

  it('To-Do のタグは分類にならない', () => {
    useTaskStore.setState({ tasks: [log('todo', { kind: 'todo', completed: false, tags: ['就活'] })] })
    useTaskStore.getState().updateTask('todo', { title: '変更' })
    expect(useTaskStore.getState().tasks[0]).toMatchObject({ category: null, tags: ['就活'] })
  })

  it('ラベル名を変えると、その分類の記録も新しい名前になり、ラベル表の時刻が付く', () => {
    useTaskStore.setState({
      tasks: [log('a', { category: '勉強', tags: ['勉強'] })],
      timeLogTagPresets: ['勉強'],
      logCategoryColors: { 勉強: 'sage' },
      logLabelsUpdatedAt: null,
    })
    useTaskStore.getState().saveLogLabels([{ from: '勉強', name: 'Study', color: 'sage' }])
    expect(useTaskStore.getState().tasks[0]).toMatchObject({ category: 'Study', tags: ['Study'] })
    expect(useTaskStore.getState().logLabelsUpdatedAt).not.toBeNull()
  })

  it('名前の無い色の色を変えると、その色のタスク・記録と絞り込みも新しい色へ', () => {
    useTaskStore.setState({
      tasks: [
        log('todo', { kind: 'todo', completed: false, color: '#039BE5' }),
        log('rec', { category: null, color: '#039BE5' }),
        log('other', { kind: 'todo', completed: false, color: '#D50000' }),
      ],
      timeLogTagPresets: ['勉強'],
      logCategoryColors: { 勉強: 'sage' },
      filterColor: '#039BE5',
    })
    useTaskStore.getState().saveLogLabels([
      { from: '勉強', name: '勉強', color: 'sage' },
      { from: null, name: '', color: 'grape', fromHex: '#039BE5' },
    ])
    const s = useTaskStore.getState()
    expect(s.tasks.map((t) => t.color)).toEqual(['#8E24AA', '#8E24AA', '#D50000'])
    expect(s.timeLogTagPresets).toEqual(['勉強'])
    expect(s.filterColor).toBe('#8E24AA')
  })

  it('名前の無い色に名前を付けると、その色の記録がそのラベルになる', () => {
    useTaskStore.setState({
      tasks: [log('rec', { category: null, color: '#039BE5' })],
      timeLogTagPresets: [],
      logCategoryColors: {},
    })
    useTaskStore.getState().saveLogLabels([{ from: null, name: '読書', color: 'peacock', fromHex: '#039BE5' }])
    expect(useTaskStore.getState().tasks[0]).toMatchObject({ category: '読書' })
  })
})

describe('止めた直後の「ラベルは？」', () => {
  const stopAfter = (title: string, tags: string[]) => {
    useTaskStore.setState({ tasks: [], activeTimer: null, labelPromptLogId: null, completePromptTaskId: null })
    useTaskStore.getState().startTimer(title, tags)
    const timer = useTaskStore.getState().activeTimer!
    useTaskStore.setState({ activeTimer: { ...timer, startedAt: new Date(Date.now() - 30 * 60_000).toISOString() } })
    useTaskStore.getState().stopTimer()
    return useTaskStore.getState()
  }

  it('ラベルなしで止めたら、その記録に聞く', () => {
    const s = stopAfter('ES 下書き', [])
    expect(s.labelPromptLogId).toBe(s.tasks.at(-1)!.id)
  })

  it('ラベルが付いていれば聞かない', () => {
    expect(stopAfter('ES 下書き', ['就活']).labelPromptLogId).toBeNull()
  })
})
