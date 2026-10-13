import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../types/task'
import { listAutoBackups, saveAutoBackup } from './autoBackup'

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

  it('同期の直前の控えは同じ日でも取る', async () => {
    expect(await saveAutoBackup('daily', '2026-10-13', tasks, '{}', 'u1')).toBe(true)
    expect(await saveAutoBackup('beforeSync', '2026-10-13', tasks, '{}', 'u1')).toBe(true)
    expect(await saveAutoBackup('beforeSync', '2026-10-13', tasks, '{}', 'u1')).toBe(true)
    expect((await listAutoBackups('u1')).map((b) => b.kind).sort()).toEqual(['beforeSync', 'beforeSync', 'daily'])
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
