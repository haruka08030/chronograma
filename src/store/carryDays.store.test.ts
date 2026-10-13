import { beforeAll, describe, expect, it, vi } from 'vitest'
import { addDays } from 'date-fns'
import { TASK_DEFAULTS } from '../lib/taskDefaults'
import { toDateKey } from '../lib/dateKey'
import { appToday } from '../lib/timeZone'
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

const day = (n: number) => toDateKey(addDays(appToday(), n))
const now = new Date().toISOString()
const todo = (id: string, over: Partial<Task> = {}): Task =>
  ({
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
    priority: 'none',
    tags: [],
    recurrence: null,
    ...over,
  }) as Task

const carried = (id: string) => useTaskStore.getState().tasks.find((t) => t.id === id)!.carriedDays

describe('続けて持ち越した日数（#300）', () => {
  it('明日へ回すと +1、やり残しを今日へ移すと置いたままの日数を足す', () => {
    useTaskStore.setState({ tasks: [todo('es', { scheduledDate: day(0) }), todo('report', { scheduledDate: day(-2) })] })
    const s = useTaskStore.getState()
    s.rescheduleTasks(['es'], day(1))
    expect(carried('es')).toBe(1)
    s.rescheduleTasks(['report'], day(0))
    expect(carried('report')).toBe(2)
  })

  it('完了すると 0、戻しても 0 のまま', () => {
    useTaskStore.setState({ tasks: [todo('es', { scheduledDate: day(0), carriedDays: 3 })] })
    useTaskStore.getState().toggleTask('es')
    expect(carried('es')).toBe(0)
    useTaskStore.getState().toggleTask('es')
    expect(carried('es')).toBe(0)
  })

  it('実行日を外すと 0', () => {
    useTaskStore.setState({ tasks: [todo('es', { scheduledDate: day(0), carriedDays: 3 })] })
    useTaskStore.getState().updateTask('es', { scheduledDate: null })
    expect(carried('es')).toBe(0)
  })

  it('いつかのリストへ移すと 0。ふつうのリストへ移しても変わらない', () => {
    useTaskStore.setState({
      lists: [
        ...useTaskStore.getState().lists.filter((l) => l.id === '__inbox__'),
        { ...useTaskStore.getState().lists.find((l) => l.id === '__inbox__')!, id: 'wish', name: 'いつか', kind: 'someday' },
        { ...useTaskStore.getState().lists.find((l) => l.id === '__inbox__')!, id: 'job', name: '就活', kind: 'tasks' },
      ],
      tasks: [todo('es', { scheduledDate: day(0), carriedDays: 3 }), todo('web', { scheduledDate: day(0), carriedDays: 2 })],
    })
    useTaskStore.getState().moveTaskToList('web', 'job')
    expect(carried('web')).toBe(2)
    useTaskStore.getState().moveTaskToList('es', 'wish')
    expect(carried('es')).toBe(0)
  })
})
