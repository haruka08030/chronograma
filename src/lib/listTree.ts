import type { Task } from '../types/task'
import { expandDescendantIds } from '../store/taskHelpers'

const live = (t: Task) => !t.deletedAt && !t.archivedAt

/** いつか・チェックリストの子（親 id → 子の並び順）。画面は 1 段だけ下げて出す */
export function childrenByParent(tasks: readonly Task[], listId: string): Map<string, Task[]> {
  const out = new Map<string, Task[]>()
  for (const t of tasks) {
    if (t.listId !== listId || !t.parentId || !live(t) || t.isTimeLog) continue
    const arr = out.get(t.parentId)
    if (arr) arr.push(t)
    else out.set(t.parentId, [t])
  }
  for (const arr of out.values()) arr.sort((a, b) => a.order - b.order)
  return out
}

/**
 * チェックリストのチェック（親子つき）。メニュー「カレー」の下に材料を並べる使い方。
 * - 子のある行: 子ごとまとめてチェック / まとめて戻す
 * - 子: 自分だけ切り替え、兄弟がそろったら親もチェック済み、1 つでも戻したら親も戻す
 */
export function toggleChecklistTree(tasks: Task[], id: string, now: string): Task[] | null {
  const target = tasks.find((t) => t.id === id)
  if (!target) return null
  const willComplete = !target.completed
  const changed = new Map<string, boolean>()
  for (const tid of expandDescendantIds([id], tasks)) changed.set(tid, willComplete)

  const parent = target.parentId ? tasks.find((t) => t.id === target.parentId) : null
  if (parent) {
    const siblings = tasks.filter((t) => t.parentId === parent.id && live(t))
    const allDone = siblings.every((t) => (t.id === id ? willComplete : t.completed))
    if (allDone !== parent.completed) changed.set(parent.id, allDone)
  }

  return tasks.map((t) => {
    const next = changed.get(t.id)
    if (next === undefined || !live(t) || next === t.completed) return t
    return { ...t, completed: next, completedAt: next ? now : null, updatedAt: now }
  })
}
