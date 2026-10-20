// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../types/task'
import { TASK_DEFAULTS } from './taskDefaults'

/** Google で消されたアプリの予定をゴミ箱に入れる（#494） */
const confirm = vi.hoisted(() => ({ ask: vi.fn(async () => true) }))
vi.mock('./confirmDialog', () => ({ askConfirm: confirm.ask }))

const { trashGoogleDeleted, ASK_OVER } = await import('./googleDeleted')
const { useTaskStore } = await import('../store/taskStore')

const task = (id: string, over: Partial<Task> = {}): Task =>
  ({
    ...TASK_DEFAULTS,
    id,
    kind: 'event',
    title: id,
    description: '',
    completed: false,
    completedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    order: 0,
    listId: 'inbox',
    sectionId: null,
    parentId: null,
    dueDate: null,
    scheduledDate: '2026-10-14',
    startTime: '10:00',
    endTime: '11:30',
    endDate: null,
    timeZone: null,
    timeZoneAnchor: null,
    color: null,
    archivedAt: null,
    deletedAt: null,
    ...over,
  }) as Task

const trashed = () =>
  useTaskStore
    .getState()
    .tasks.filter((t) => t.deletedAt)
    .map((t) => t.id)
    .sort()

beforeEach(() => {
  confirm.ask.mockReset().mockResolvedValue(true)
  useTaskStore.setState({ tasks: [], recentDeletes: [] })
})

describe('trashGoogleDeleted', () => {
  it('予定だけゴミ箱に入れ（記録・To-Do は触らない）、件数の文で知らせる', async () => {
    useTaskStore.setState({
      tasks: [task('a'), task('log', { kind: 'log' } as Partial<Task>), task('todo', { kind: 'todo' } as Partial<Task>)],
    })
    expect(await trashGoogleDeleted(['a', 'log', 'todo'])).toBe(1)
    expect(trashed()).toEqual(['a'])
    // 消さずにゴミ箱（30 日は戻せる）
    expect(useTaskStore.getState().tasks).toHaveLength(3)
    expect(useTaskStore.getState().recentDeletes.at(-1)?.label).toEqual({ key: 'googleDeleted.moved', params: { count: 1 } })
    expect(confirm.ask).not.toHaveBeenCalled()
  })

  it('まだ送っていない変更のある予定・消された後にアプリで変えた予定は入れない', async () => {
    useTaskStore.setState({ tasks: [task('pending'), task('newer', { updatedAt: '2026-10-20T00:00:00Z' }), task('older')] })
    const deletedAt = new Map([
      ['newer', '2026-10-19T00:00:00Z'],
      ['older', '2026-10-19T00:00:00Z'],
    ])
    expect(await trashGoogleDeleted(['pending', 'newer', 'older'], { pending: new Set(['pending']), deletedAt })).toBe(1)
    expect(trashed()).toEqual(['older'])
  })

  it(`${ASK_OVER} 件より多いときは確かめ、断られたら入れず、もう聞かない`, async () => {
    const ids = Array.from({ length: ASK_OVER + 1 }, (_, i) => `m${i}`)
    useTaskStore.setState({ tasks: ids.map((id) => task(id)) })
    confirm.ask.mockResolvedValue(false)
    expect(await trashGoogleDeleted(ids)).toBe(0)
    expect(confirm.ask).toHaveBeenCalledTimes(1)
    expect(trashed()).toEqual([])
    expect(await trashGoogleDeleted(ids)).toBe(0)
    expect(confirm.ask).toHaveBeenCalledTimes(1)
  })

  it(`${ASK_OVER} 件より多くても、確かめて良ければ入れる`, async () => {
    const ids = Array.from({ length: ASK_OVER + 1 }, (_, i) => `n${i}`)
    useTaskStore.setState({ tasks: ids.map((id) => task(id)) })
    expect(await trashGoogleDeleted(ids)).toBe(ids.length)
    expect(confirm.ask).toHaveBeenCalledTimes(1)
    expect(trashed()).toEqual([...ids].sort())
  })
})
