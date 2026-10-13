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

const tasks = () => useTaskStore.getState().tasks
const get = (id: string) => tasks().find((t) => t.id === id)!

beforeEach(() => {
  useTaskStore.setState({
    lists: [{ id: 'l', name: 'L', color: '#33B679', order: 0, kind: 'tasks' }],
    tasks: [
      task('report', {
        order: 0,
        scheduledDate: '2026-10-06',
        startTime: '10:00',
        endTime: '11:00',
        dueDate: '2026-10-08',
        description: 'メモ',
        color: '#D50000',
        priority: 'high',
        estimateMinutes: 60,
        carriedDays: 3,
        completed: true,
        completedAt: '2026-10-06T02:00:00Z',
        movedPlans: [{ date: '2026-10-05', startTime: null, endTime: null, to: '2026-10-06' }],
      }),
      task('step1', { parentId: 'report', order: 0, completed: true, completedAt: '2026-10-06T01:00:00Z' }),
      task('gone', { parentId: 'report', order: 1, deletedAt: '2026-10-06T01:00:00Z' }),
      task('next', { order: 1 }),
      task('class', {
        kind: 'event',
        order: 2,
        scheduledDate: '2026-10-07',
        startTime: '9:00',
        endTime: '10:30',
        series: { id: 's', weekdays: [3], until: '2027-01-31', skipHolidays: true },
      }),
      task('log', { kind: 'log', order: 3, dueDate: '2026-10-06', startTime: '10:00', endTime: '11:00' }),
    ],
  })
})

describe('duplicateTasks', () => {
  it('同じ日・時間・中身で元のすぐ後ろに写し、完了・持ち越し・控えは引き継がない', () => {
    const [id] = useTaskStore.getState().duplicateTasks(['report'])
    const copy = get(id)
    expect(copy).toMatchObject({
      title: 'report',
      description: 'メモ',
      scheduledDate: '2026-10-06',
      startTime: '10:00',
      endTime: '11:00',
      dueDate: '2026-10-08',
      color: '#D50000',
      priority: 'high',
      estimateMinutes: 60,
      completed: false,
      completedAt: null,
      carriedDays: 0,
    })
    expect(copy.movedPlans).toBeUndefined()
    expect(copy.order).toBeGreaterThan(get('report').order)
    expect(copy.order).toBeLessThan(get('next').order)
  })

  it('子も写す（ゴミ箱の子は写さない）', () => {
    const [id] = useTaskStore.getState().duplicateTasks(['report'])
    const children = tasks().filter((t) => t.parentId === id)
    expect(children.map((t) => t.title)).toEqual(['step1'])
    expect(children[0].completed).toBe(false)
  })

  it('毎週の予定の 1 回を写すと、繰り返しから外れたふつうの予定になる', () => {
    const [id] = useTaskStore.getState().duplicateTasks(['class'])
    expect(get(id)).toMatchObject({ kind: 'event', scheduledDate: '2026-10-07', startTime: '9:00' })
    expect(get(id).series).toBeUndefined()
    expect(get('class').series?.id).toBe('s')
  })

  it('親と子を一緒に選んでも子は 2 つ作らない。記録は写さない', () => {
    const before = tasks().length
    const ids = useTaskStore.getState().duplicateTasks(['report', 'step1', 'log'])
    expect(ids).toHaveLength(1)
    expect(tasks().length).toBe(before + 2)
  })

  it('複数まとめて写しても 1 回の取り消しで戻る', () => {
    const before = tasks().length
    useTaskStore.getState().duplicateTasks(['report', 'next'])
    expect(tasks().length).toBe(before + 3)
    useTaskStore.getState().undoLastOperation()
    expect(tasks().length).toBe(before)
  })
})
