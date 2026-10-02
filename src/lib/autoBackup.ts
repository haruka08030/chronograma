import type { Task } from '../types/task'
import type { TaskList } from '../types/list'
import type { ListSection } from '../types/section'
import type { Habit } from '../types/habit'
import { SYNC_INBOX_LIST_ID } from './syncMerge'

/**
 * 自動バックアップ。この端末の IndexedDB に控えを残す。
 * - 毎日: その日はじめて開いたときの状態（同期が反映される前）。14 日分
 * - 同期の直前: 同期で手元のタスクが減るときの、減る前の状態。5 件分
 *
 * 送信に失敗している間に、サーバーの古い内容で手元が置き換わって 9 日分のタスクが
 * 消えたことがある。サーバーにも手元にも無くなったものを戻せるのはこれだけ。
 */

export type AutoBackupKind = 'daily' | 'beforeSync'

export interface AutoBackupMeta {
  id: string
  kind: AutoBackupKind
  /** 控えた時刻（ISO） */
  savedAt: string
  /** 毎日の控えはこの日付（端末の暦）で 1 つ */
  dateKey: string
  todoCount: number
  logCount: number
}

export interface AutoBackup extends AutoBackupMeta {
  /** エクスポートと同じ形の JSON（`buildBackupPayload`） */
  json: string
}

export const DAILY_KEEP = 14
export const BEFORE_SYNC_KEEP = 5

const DB_NAME = 'chronograma-backups'
const STORE = 'snapshots'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openDb()
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const req = run(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(req ? req.result : undefined)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

async function getAll(): Promise<AutoBackup[]> {
  return ((await withStore<AutoBackup[]>('readonly', (s) => s.getAll())) ?? []).sort((a, b) =>
    b.savedAt.localeCompare(a.savedAt),
  )
}

/** 新しい順。中身（json）は含めない */
export async function listAutoBackups(): Promise<AutoBackupMeta[]> {
  try {
    return (await getAll()).map(({ json, ...meta }) => {
      void json
      return meta
    })
  } catch {
    return []
  }
}

export async function loadAutoBackup(id: string): Promise<AutoBackup | null> {
  try {
    return (await withStore<AutoBackup>('readonly', (s) => s.get(id))) ?? null
  } catch {
    return null
  }
}

/** 残す数を超えた古いものの id */
export function idsToPrune(all: readonly AutoBackupMeta[]): string[] {
  const sorted = [...all].sort((a, b) => b.savedAt.localeCompare(a.savedAt))
  const daily = sorted.filter((b) => b.kind === 'daily').slice(DAILY_KEEP)
  const beforeSync = sorted.filter((b) => b.kind === 'beforeSync').slice(BEFORE_SYNC_KEEP)
  return [...daily, ...beforeSync].map((b) => b.id)
}

export function countTasks(tasks: readonly Task[]): { todoCount: number; logCount: number } {
  let todoCount = 0
  let logCount = 0
  for (const t of tasks) {
    if (t.deletedAt) continue
    if (t.isTimeLog) logCount++
    else todoCount++
  }
  return { todoCount, logCount }
}

/**
 * 控えを 1 つ足す。毎日の控えはその日にまだ無いときだけ。
 * 書き込みに失敗しても（容量・プライベートモード）アプリは止めない
 */
export async function saveAutoBackup(
  kind: AutoBackupKind,
  dateKey: string,
  tasks: readonly Task[],
  json: string,
): Promise<boolean> {
  if (tasks.length === 0) return false
  try {
    const all = await getAll()
    if (kind === 'daily' && all.some((b) => b.kind === 'daily' && b.dateKey === dateKey)) return false
    const savedAt = new Date().toISOString()
    const entry: AutoBackup = { id: `${kind}-${savedAt}`, kind, savedAt, dateKey, ...countTasks(tasks), json }
    const prune = idsToPrune([entry, ...all])
    await withStore('readwrite', (s) => {
      s.put(entry)
      for (const id of prune) s.delete(id)
    })
    return true
  } catch (e) {
    console.error('[backup]', e)
    return false
  }
}

export interface RestorableData {
  lists: TaskList[]
  sections: ListSection[]
  tasks: Task[]
  habits: Habit[]
}

/**
 * 控えにあって今は無いものだけを足す（今あるものは触らない）。
 * 足したものは更新時刻を今にする。古い時刻のままだと、同期で「他端末で消された」と見なされてまた消える
 */
export function restoreMissing(
  current: RestorableData,
  backup: RestorableData,
  now: string,
): { next: RestorableData; addedTasks: number } {
  const listIds = new Set(current.lists.map((l) => l.id))
  const lists = [...current.lists]
  for (const l of backup.lists) {
    if (listIds.has(l.id)) continue
    lists.push({ ...l, updatedAt: now })
    listIds.add(l.id)
  }

  const sectionIds = new Set(current.sections.map((s) => s.id))
  const sections = [...current.sections]
  for (const s of backup.sections) {
    if (sectionIds.has(s.id) || !listIds.has(s.listId)) continue
    sections.push({ ...s, updatedAt: now })
    sectionIds.add(s.id)
  }

  const taskIds = new Set(current.tasks.map((t) => t.id))
  const added = backup.tasks.filter((t) => !taskIds.has(t.id))
  const allTaskIds = new Set([...taskIds, ...added.map((t) => t.id)])
  const tasks = [
    ...current.tasks,
    ...added.map((t) => {
      const listOk = listIds.has(t.listId)
      return {
        ...t,
        listId: listOk ? t.listId : SYNC_INBOX_LIST_ID,
        sectionId: listOk && t.sectionId && sectionIds.has(t.sectionId) ? t.sectionId : null,
        parentId: t.parentId && allTaskIds.has(t.parentId) ? t.parentId : null,
        updatedAt: now,
      }
    }),
  ]

  const habitIds = new Set(current.habits.map((h) => h.id))
  const habits = [...current.habits, ...backup.habits.filter((h) => !habitIds.has(h.id)).map((h) => ({ ...h, updatedAt: now }))]

  return { next: { lists, sections, tasks, habits }, addedTasks: added.length }
}
