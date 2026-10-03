import type { Task } from '../types/task'
import type { TaskList } from '../types/list'
import type { ListSection } from '../types/section'
import type { Habit } from '../types/habit'
import { CANVAS_LIST_ID, isCanvasListId } from './canvasIds'

export const SYNC_INBOX_LIST_ID = '__inbox__'

export interface SyncSnapshot {
  lists: TaskList[]
  tasks: Task[]
  habits: Habit[]
  sections: ListSection[]
}

/** 前回同期した時点の ID → updatedAt の epoch ms（updatedAt が無いものは 0） */
export interface SyncBaseline {
  lists: Record<string, number>
  tasks: Record<string, number>
  habits: Record<string, number>
  sections: Record<string, number>
}

/**
 * updatedAt を数値で比べる。ローカルは `…123Z`、Postgres は `…123+00:00` / マイクロ秒付きで返すため
 * 文字列比較だと同じ時刻でも大小がずれる
 */
function stampMs(iso: string | null | undefined): number {
  const n = iso ? Date.parse(iso) : NaN
  return Number.isFinite(n) ? n : 0
}

export interface SyncDeletes {
  lists: string[]
  tasks: string[]
  habits: string[]
  sections: string[]
}

interface MergeResult<T> {
  merged: T[]
  deleteRemote: string[]
}

/**
 * 1 種類ぶんの三方向マージ。
 * - 両方にある: updatedAt が新しい方（同じならローカル＝今見えているもの）
 * - ローカルだけ: 前回同期に含まれていた＝他端末で削除。ただしその後ローカルで編集していれば残す
 * - サーバーだけ: 前回同期に含まれていた＝この端末で削除。ただしその後他端末で編集されていれば戻す
 * - 前回同期に無い: 新規なので残す（他端末で追加したものを消さない）
 */
function mergeKind<T extends { id: string }>(
  local: readonly T[],
  remote: readonly T[],
  baseline: Record<string, number>,
  stamp: (x: T) => number,
): MergeResult<T> {
  const remoteById = new Map(remote.map((r) => [r.id, r]))
  const localIds = new Set(local.map((l) => l.id))
  const merged: T[] = []
  const deleteRemote: string[] = []

  for (const l of local) {
    const r = remoteById.get(l.id)
    if (r) {
      merged.push(stamp(r) > stamp(l) ? r : l)
      continue
    }
    const base = baseline[l.id]
    if (base === undefined || stamp(l) > base) merged.push(l)
  }
  for (const r of remote) {
    if (localIds.has(r.id)) continue
    const base = baseline[r.id]
    // base 0 は「前回同期にあったが時刻が分からない」（更新時刻を持つ前の控え）。編集されたとはみなさず、この端末の削除を通す
    if (base === undefined || (base > 0 && stamp(r) > base)) merged.push(r)
    else deleteRemote.push(r.id)
  }
  return { merged, deleteRemote }
}

/** ローカル・サーバー・前回同期の 3 点から、両端末の変更を取りこぼさない状態を作る */
export function mergeSnapshots(
  local: SyncSnapshot,
  remote: SyncSnapshot,
  baseline: SyncBaseline,
): { merged: SyncSnapshot; deletes: SyncDeletes } {
  const lists = mergeKind(local.lists, remote.lists, baseline.lists, (l) => stampMs(l.updatedAt))
  const sections = mergeKind(local.sections, remote.sections, baseline.sections, (s) => stampMs(s.updatedAt))
  const tasks = mergeKind(local.tasks, remote.tasks, baseline.tasks, (t) => stampMs(t.updatedAt))
  const habits = mergeKind(local.habits, remote.habits, baseline.habits, (h) => stampMs(h.updatedAt))

  // 片方で消えた親を参照していると外部キーで push が落ちるので付け替える
  const listIds = new Set(lists.merged.map((l) => l.id))
  if (!listIds.has(SYNC_INBOX_LIST_ID)) {
    const inbox = local.lists.find((l) => l.id === SYNC_INBOX_LIST_ID) ?? remote.lists.find((l) => l.id === SYNC_INBOX_LIST_ID)
    if (inbox) {
      lists.merged.push(inbox)
      listIds.add(SYNC_INBOX_LIST_ID)
    }
  }
  // 消えたリストの付け替え先。Canvas の古いリスト（学校ごと）は Canvas のリストへ（未分類に課題を散らさない）
  const fallbackList = (listId: string) =>
    isCanvasListId(listId) && listIds.has(CANVAS_LIST_ID) ? CANVAS_LIST_ID : SYNC_INBOX_LIST_ID
  const mergedSections = sections.merged
    .map((s) => (listIds.has(s.listId) || fallbackList(s.listId) !== CANVAS_LIST_ID ? s : { ...s, listId: CANVAS_LIST_ID }))
    .filter((s) => listIds.has(s.listId))
  // 消えたリストのセクションがサーバーに残っていると、リストの削除が外部キーで通らない（004）。一緒に消す
  const keptSectionIds = new Set(mergedSections.map((s) => s.id))
  const remoteSectionIds = new Set(remote.sections.map((s) => s.id))
  const orphanSections = sections.merged
    .filter((s) => !keptSectionIds.has(s.id) && remoteSectionIds.has(s.id))
    .map((s) => s.id)
  const sectionListById = new Map(mergedSections.map((s) => [s.id, s.listId]))
  const taskIds = new Set(tasks.merged.map((t) => t.id))
  const mergedTasks = tasks.merged.map((t) => {
    const listOk = listIds.has(t.listId)
    const listId = listOk ? t.listId : fallbackList(t.listId)
    const sectionList = t.sectionId == null ? undefined : sectionListById.get(t.sectionId)
    const sectionOk = t.sectionId == null || (sectionList !== undefined && (listOk || sectionList === listId))
    const parentOk = t.parentId == null || taskIds.has(t.parentId)
    if (listOk && sectionOk && parentOk) return t
    return {
      ...t,
      listId,
      sectionId: sectionOk ? t.sectionId : null,
      parentId: parentOk ? t.parentId : null,
    }
  })

  return {
    merged: { lists: lists.merged, sections: mergedSections, tasks: mergedTasks, habits: habits.merged },
    deletes: {
      lists: lists.deleteRemote.filter((id) => id !== SYNC_INBOX_LIST_ID),
      sections: [...sections.deleteRemote, ...orphanSections],
      tasks: tasks.deleteRemote,
      habits: habits.deleteRemote,
    },
  }
}

/**
 * 前回同期が無いとき（この端末で初めて・前回同期の保存に失敗した）のマージ。
 * どちらで消したかは分からないので、両方にあるものを残す（同じ id は新しい方）。
 * サーバーで丸ごと置き換えると、push できずに手元にだけあった変更が消える
 */
export function mergeWithoutBaseline(local: SyncSnapshot, remote: SyncSnapshot): SyncSnapshot {
  const empty: SyncBaseline = { lists: {}, sections: {}, tasks: {}, habits: {} }
  return mergeSnapshots(local, remote, empty).merged
}

export function baselineFrom(s: SyncSnapshot): SyncBaseline {
  const ids = <T extends { id: string }>(xs: readonly T[], stamp: (x: T) => number) =>
    Object.fromEntries(xs.map((x) => [x.id, stamp(x)]))
  return {
    lists: ids(s.lists, (l) => stampMs(l.updatedAt)),
    sections: ids(s.sections, (sec) => stampMs(sec.updatedAt)),
    tasks: ids(s.tasks, (t) => stampMs(t.updatedAt)),
    habits: ids(s.habits, (h) => stampMs(h.updatedAt)),
  }
}

const baselineKey = (userId: string) => `chronograma-sync-baseline-v1:${userId}`

export function loadBaseline(userId: string): SyncBaseline | null {
  try {
    const raw = localStorage.getItem(baselineKey(userId))
    return raw ? (JSON.parse(raw) as SyncBaseline) : null
  } catch {
    return null
  }
}

export function clearBaseline(userId: string) {
  try {
    localStorage.removeItem(baselineKey(userId))
  } catch {
    /* ignore */
  }
}

export function saveBaseline(userId: string, baseline: SyncBaseline) {
  try {
    localStorage.setItem(baselineKey(userId), JSON.stringify(baseline))
  } catch {
    /* 保存できなければ次回は初回同期扱い（両方を残すマージ）になるだけ */
  }
}
