import { isLogTask, type Task } from '../types/task'
import type { TaskList } from '../types/list'
import type { ListSection } from '../types/section'
import type { Habit } from '../types/habit'
import { SYNC_INBOX_LIST_ID } from './syncMerge'
import { LEGACY_DATA_OWNER } from '../store/storeConstants'

/**
 * 自動バックアップ。この端末の IndexedDB に控えを残す。
 * - 毎日: その日はじめて開いたときの状態（同期が反映される前）。14 日分
 * - 同期の直前: 同期で手元のタスクが減るときの、減る前の状態。5 件分
 * - ログアウトの直前: ログアウトで手元のデータを消す前の状態（送れていなかった変更を戻せるように）。5 件分
 *
 * 送信に失敗している間に、サーバーの古い内容で手元が置き換わって 9 日分のタスクが
 * 消えたことがある。サーバーにも手元にも無くなったものを戻せるのはこれだけ。
 *
 * 控えには持ち主（`owner` = 控えたときの `dataOwner`）を付け、一覧には見ている人の分だけを出す。
 * 共用の端末で、ログアウトした人の控えを次の人が戻せないようにするため（`visibleBackups`）。
 */

export type AutoBackupKind = 'daily' | 'beforeSync' | 'beforeSignOut' | 'beforeSignIn'

export interface AutoBackupMeta {
  id: string
  kind: AutoBackupKind
  /** 控えた時刻（ISO） */
  savedAt: string
  /** 毎日の控えはこの日付（端末の暦）で 1 つ */
  dateKey: string
  todoCount: number
  logCount: number
  /**
   * 控えたデータの持ち主。利用者の id、ログインせずに作ったデータは null、
   * 持ち主の記録が無い古いデータは `LEGACY_DATA_OWNER`。持ち主を付ける前の控えは undefined
   */
  owner?: string | null
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
  return ((await withStore<AutoBackup[]>('readonly', (s) => s.getAll())) ?? []).sort((a, b) => b.savedAt.localeCompare(a.savedAt))
}

/**
 * いま見ている人（ログイン中の利用者の id、ログインしていなければ null）が戻せる控えか。
 * - 本人の控えと、ログインせずに作ったデータの控え（null）は、その人だけ
 * - 持ち主の分からない控え（古い版のデータ・持ち主を付ける前の控え）は、ログインしている人だけ
 */
export function canViewBackup(b: Pick<AutoBackupMeta, 'owner'>, viewer: string | null): boolean {
  if (b.owner === undefined || b.owner === LEGACY_DATA_OWNER) return viewer !== null
  return b.owner === viewer
}

/** 新しい順。中身（json）は含めない。見ている人が戻せるものだけ */
export async function listAutoBackups(viewer: string | null): Promise<AutoBackupMeta[]> {
  try {
    return (await getAll())
      .filter((b) => canViewBackup(b, viewer))
      .map(({ json, ...meta }) => {
        void json
        return meta
      })
  } catch {
    return []
  }
}

export async function loadAutoBackup(id: string, viewer: string | null): Promise<AutoBackup | null> {
  try {
    const b = (await withStore<AutoBackup>('readonly', (s) => s.get(id))) ?? null
    return b && canViewBackup(b, viewer) ? b : null
  } catch {
    return null
  }
}

/** 残す数を超えた古いものの id。数えるのは持ち主ごと（ほかの人の控えに押し出されないように） */
export function idsToPrune(all: readonly AutoBackupMeta[]): string[] {
  const sorted = [...all].sort((a, b) => b.savedAt.localeCompare(a.savedAt))
  const groups = new Map<string, AutoBackupMeta[]>()
  for (const b of sorted) {
    const key = `${b.kind}\u0000${b.owner ?? ''}`
    const group = groups.get(key)
    if (group) group.push(b)
    else groups.set(key, [b])
  }
  const out: string[] = []
  for (const group of groups.values()) {
    const keep = group[0].kind === 'daily' ? DAILY_KEEP : BEFORE_SYNC_KEEP
    out.push(...group.slice(keep).map((b) => b.id))
  }
  return out
}

export function countTasks(tasks: readonly Task[]): { todoCount: number; logCount: number } {
  let todoCount = 0
  let logCount = 0
  for (const t of tasks) {
    if (t.deletedAt) continue
    if (isLogTask(t)) logCount++
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
  owner: string | null,
): Promise<boolean> {
  if (tasks.length === 0) return false
  try {
    const all = await getAll()
    if (kind === 'daily' && all.some((b) => b.kind === 'daily' && b.dateKey === dateKey && (b.owner ?? null) === owner)) return false
    const savedAt = new Date().toISOString()
    const entry: AutoBackup = { id: `${kind}-${savedAt}`, kind, savedAt, dateKey, ...countTasks(tasks), owner, json }
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

/** アカウントを削除したときに、この端末にあるその人の控え（と持ち主の分からない控え）を消す */
export async function clearAutoBackups(userId: string): Promise<void> {
  try {
    const ids = (await getAll())
      .filter((b) => b.owner === userId || b.owner === undefined || b.owner === LEGACY_DATA_OWNER)
      .map((b) => b.id)
    await withStore('readwrite', (s) => {
      for (const id of ids) s.delete(id)
    })
  } catch {
    /* 開けなければ消すものも無い */
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
export function restoreMissing(current: RestorableData, backup: RestorableData, now: string): { next: RestorableData; addedTasks: number } {
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
