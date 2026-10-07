import { describe, expect, it } from 'vitest'
import { adoptOtherTabChanges, useTaskStore } from './taskStore'
import { PERSIST_STORAGE_KEY, STORE_VERSION } from './storeConstants'
import { readViewState } from './viewState'

const good = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  title: id,
  listId: '__inbox__',
  order: 0,
  completed: false,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  tags: [],
  ...over,
})
const unreadableKeys = () => Object.keys(localStorage).filter((k) => k.startsWith(`${PERSIST_STORAGE_KEY}-unreadable-`))
const write = (tasks: unknown[]) =>
  localStorage.setItem(
    PERSIST_STORAGE_KEY,
    JSON.stringify({ state: { tasks, lists: [], habits: [], sections: [] }, version: STORE_VERSION }),
  )

describe('保存データ・他のタブの行を中身まで確かめる（#269）', () => {
  it('読み込み: 型の違う項目は直し、読めない行は外し、元の中身を別のキーに残す', async () => {
    write([good('t1'), good('bad', { title: 123 }), good('t2', { tags: 'x', startTime: 930 })])
    await useTaskStore.persist.rehydrate()

    const tasks = useTaskStore.getState().tasks
    expect(tasks.map((t) => t.id)).toEqual(['t1', 't2'])
    expect(tasks.find((t) => t.id === 't2')).toMatchObject({ tags: [], startTime: null })
    expect(unreadableKeys().length).toBeGreaterThan(0)
  })

  it('他のタブの書き込み: 同じ基準でそろえてから取り込む', () => {
    write([good('a'), good('bad', { title: null }), good('b', { tags: 'x' })])
    adoptOtherTabChanges()

    const tasks = useTaskStore.getState().tasks
    expect(tasks.map((t) => t.id)).toEqual(['a', 'b'])
    expect(tasks.find((t) => t.id === 'b')?.tags).toEqual([])
    expect(unreadableKeys().length).toBeGreaterThan(0)
  })
})

describe('readViewState', () => {
  it('形の違う値・知らないビューは捨てる', () => {
    expect(readViewState({ sortByKey: null, selectedView: 'inbox', calendarMode: 'week', selectedListId: 5 })).toEqual({
      calendarMode: 'week',
    })
    expect(readViewState({ sortByKey: { all: 'dueDate', x: 'nope' } })).toEqual({ sortByKey: { all: 'dueDate' } })
    expect(readViewState('junk')).toEqual({})
  })
})
