import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../types/task'
import { idsOverTotal, listAutoBackups, loadAutoBackup, releaseOldestBackup, saveAutoBackup } from './autoBackup'

const tasks = [{ id: 't1' } as Task]

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})

/** 日付の索引の無い前の版（1）の置き場所に、毎日の控えを 1 つ置く */
function seedV1(entry: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('chronograma-backups', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('snapshots', { keyPath: 'id' })
    req.onsuccess = () => {
      const tx = req.result.transaction('snapshots', 'readwrite')
      tx.objectStore('snapshots').put(entry)
      tx.oncomplete = () => {
        req.result.close()
        resolve()
      }
      tx.onerror = () => reject(tx.error)
    }
    req.onerror = () => reject(req.error)
  })
}

describe('毎日の控え（#257）', () => {
  it('その日の分がもうあれば、中身（JSON）を作らずに終わる。別の人の分は別に取る', async () => {
    const json = vi.fn(() => '{"tasks":[]}')
    expect(await saveAutoBackup('daily', '2026-10-13', tasks, json, 'u1')).toBe(true)
    expect(json).toHaveBeenCalledTimes(1)
    expect(await saveAutoBackup('daily', '2026-10-13', tasks, json, 'u1')).toBe(false)
    expect(json).toHaveBeenCalledTimes(1)
    expect(await saveAutoBackup('daily', '2026-10-13', tasks, json, 'u2')).toBe(true)
    expect(await saveAutoBackup('daily', '2026-10-14', tasks, json, 'u1')).toBe(true)
    expect(json).toHaveBeenCalledTimes(3)
    expect((await listAutoBackups('u1')).map((b) => b.dateKey)).toEqual(['2026-10-14', '2026-10-13'])
  })

  it('同期の直前の控えは同じ日でも取る（同じミリ秒に取っても上書きしない）', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-13T09:00:00.000Z') })
    try {
      expect(await saveAutoBackup('daily', '2026-10-13', tasks, '{}', 'u1')).toBe(true)
      expect(await saveAutoBackup('beforeSync', '2026-10-13', tasks, '{}', 'u1')).toBe(true)
      expect(await saveAutoBackup('beforeSync', '2026-10-13', tasks, '{}', 'u1')).toBe(true)
      expect((await listAutoBackups('u1')).map((b) => b.kind).sort()).toEqual(['beforeSync', 'beforeSync', 'daily'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('前の版の置き場所に索引を足し、前からある控えもその日の分として数える', async () => {
    await seedV1({
      id: 'daily-2026-10-13T00:00:00.000Z',
      kind: 'daily',
      savedAt: '2026-10-13T00:00:00.000Z',
      dateKey: '2026-10-13',
      todoCount: 1,
      logCount: 0,
      owner: 'u1',
      json: '{}',
    })
    const json = vi.fn(() => '{}')
    expect(await saveAutoBackup('daily', '2026-10-13', tasks, json, 'u1')).toBe(false)
    expect(json).not.toHaveBeenCalled()
    expect(await listAutoBackups('u1')).toHaveLength(1)
  })
})

describe('To-Do が 0 件のとき（#486）', () => {
  it('習慣・リストなどがあれば控える。何も無ければ控えない', async () => {
    expect(await saveAutoBackup('beforeSignOut', '2026-10-13', [], '{"habits":[1]}', 'u1', true)).toBe(true)
    expect(await saveAutoBackup('beforeSignOut', '2026-10-13', [], '{}', 'u1')).toBe(false)
    expect((await listAutoBackups('u1')).map((b) => b.kind)).toEqual(['beforeSignOut'])
  })
})

describe('容量（#256）', () => {
  it('合計の上限を超えたら古い控えから外す（いちばん新しい 1 件は残す）', () => {
    const b = (id: string, savedAt: string, size: number) => ({ id, savedAt, json: 'x'.repeat(size) })
    const all = [b('a', '2026-10-01', 40), b('b', '2026-10-02', 40), b('c', '2026-10-03', 40)]
    expect(idsOverTotal(all, 100)).toEqual(['a'])
    expect(idsOverTotal(all, 10)).toEqual(['b', 'a'])
  })

  it('保存領域が足りないときは、いちばん古い控えを 1 つ手放す（最後の 1 件は残す）', async () => {
    await saveAutoBackup('beforeSync', '2026-10-13', tasks, '{"old":1}', 'u1')
    await new Promise((r) => setTimeout(r, 2))
    await saveAutoBackup('beforeSync', '2026-10-13', tasks, '{"new":1}', 'u1')
    expect(await releaseOldestBackup()).toBe(true)
    const left = await listAutoBackups('u1')
    expect(left).toHaveLength(1)
    expect((await loadAutoBackup(left[0]!.id, 'u1'))!.json).toBe('{"new":1}')
    expect(await releaseOldestBackup()).toBe(false)
  })
})
