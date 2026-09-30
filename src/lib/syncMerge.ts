import type { Task } from '../types/task'
import type { TaskList } from '../types/list'
import type { ListSection } from '../types/section'
import type { Habit } from '../types/habit'

export const SYNC_INBOX_LIST_ID = '__inbox__'

export interface SyncSnapshot {
  lists: TaskList[]
  tasks: Task[]
  habits: Habit[]
  sections: ListSection[]
}

/** 前回同期した時点の ID → updatedAt の epoch ms（updatedAt を持たない種類は 0） */
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
    if (base === undefined || stamp(r) > base) merged.push(r)
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
  const noStamp = () => 0
  const lists = mergeKind(local.lists, remote.lists, baseline.lists, noStamp)
  const sections = mergeKind(local.sections, remote.sections, baseline.sections, noStamp)
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
  const mergedSections = sections.merged.filter((s) => listIds.has(s.listId))
  const sectionIds = new Set(mergedSections.map((s) => s.id))
  const taskIds = new Set(tasks.merged.map((t) => t.id))
  const mergedTasks = tasks.merged.map((t) => {
    const listOk = listIds.has(t.listId)
    const sectionOk = t.sectionId == null || sectionIds.has(t.sectionId)
    const parentOk = t.parentId == null || taskIds.has(t.parentId)
    if (listOk && sectionOk && parentOk) return t
    return {
      ...t,
      listId: listOk ? t.listId : SYNC_INBOX_LIST_ID,
      sectionId: listOk && sectionOk ? t.sectionId : null,
      parentId: parentOk ? t.parentId : null,
    }
  })

  return {
    merged: { lists: lists.merged, sections: mergedSections, tasks: mergedTasks, habits: habits.merged },
    deletes: {
      lists: lists.deleteRemote.filter((id) => id !== SYNC_INBOX_LIST_ID),
      sections: sections.deleteRemote,
      tasks: tasks.deleteRemote,
      habits: habits.deleteRemote,
    },
  }
}

export function baselineFrom(s: SyncSnapshot): SyncBaseline {
  const ids = <T extends { id: string }>(xs: readonly T[], stamp: (x: T) => number) =>
    Object.fromEntries(xs.map((x) => [x.id, stamp(x)]))
  return {
    lists: ids(s.lists, () => 0),
    sections: ids(s.sections, () => 0),
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

export function saveBaseline(userId: string, baseline: SyncBaseline) {
  try {
    localStorage.setItem(baselineKey(userId), JSON.stringify(baseline))
  } catch {
    /* 保存できなければ次回は初回同期扱い（サーバー優先）になるだけ */
  }
}
