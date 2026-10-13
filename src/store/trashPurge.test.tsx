import { describe, expect, it, vi } from 'vitest'
import { useTaskStore } from './taskStore'
import { PERSIST_STORAGE_KEY, STORE_VERSION, TRASH_KEEP_DAYS } from './storeConstants'
import { TASK_DEFAULTS } from '../lib/taskDefaults'
import type { Task } from '../types/task'

const DAY = 24 * 60 * 60_000
const NOW = Date.parse('2026-11-01T00:00:00.000Z')
const ago = (days: number) => new Date(NOW - days * DAY).toISOString()

function task(id: string, patch: Partial<Task> = {}): Task {
  return {
    ...TASK_DEFAULTS,
    id,
    title: id,
    description: '',
    completed: false,
    completedAt: null,
    createdAt: ago(60),
    updatedAt: ago(60),
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
    ...patch,
  }
}

const ids = () => useTaskStore.getState().tasks.map((t) => t.id)

describe('ゴミ箱の自動削除（#256）', () => {
  it(`ゴミ箱に入れて ${TRASH_KEEP_DAYS} 日を過ぎたものだけ完全に削除する（取り消しの履歴には積まない）`, () => {
    useTaskStore.setState({
      tasks: [
        task('live'),
        task('old', { deletedAt: ago(TRASH_KEEP_DAYS + 1) }),
        task('old-child', { parentId: 'old', deletedAt: ago(TRASH_KEEP_DAYS + 1) }),
        task('recent', { deletedAt: ago(TRASH_KEEP_DAYS - 1) }),
        task('unreadable', { deletedAt: 'not a date' }),
      ],
      recentDeletes: [{ ids: ['old', 'recent'], at: NOW }],
    })
    expect(useTaskStore.getState().purgeExpiredDeleted(NOW)).toBe(2)
    expect(ids()).toEqual(['live', 'recent', 'unreadable'])
    expect(useTaskStore.getState().recentDeletes).toEqual([{ ids: ['recent'], at: NOW }])
    expect(useTaskStore.getState().undoLastOperation()).toBe(false)
    expect(useTaskStore.getState().purgeExpiredDeleted(NOW)).toBe(0)
  })

  it('起動したときに消し、保存にも残らない（同期はこの端末で消したものとしてサーバーからも消す）', async () => {
    const old = new Date(Date.now() - (TRASH_KEEP_DAYS + 1) * DAY).toISOString()
    localStorage.setItem(
      PERSIST_STORAGE_KEY,
      JSON.stringify({
        state: { tasks: [task('keep'), task('trash-old', { deletedAt: old })], lists: [], habits: [], sections: [] },
        version: STORE_VERSION,
      }),
    )
    vi.resetModules()
    const fresh = (await import('./taskStore')).useTaskStore
    expect(fresh.getState().tasks.map((t) => t.id)).toEqual(['keep'])
    expect(localStorage.getItem(PERSIST_STORAGE_KEY)).not.toContain('trash-old')
  })
})
