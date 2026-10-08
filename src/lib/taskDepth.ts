import { isLogTask, type Task } from '../types/task'
import { compareByOrder } from './orderCompare'

/** ルートタスクを深さ 0 とする。子は +1（最大チェーンは 5 レベル = 深さ 0..4） */
export const MAX_TASK_TREE_DEPTH = 4

export function taskDepth(tasks: Task[], taskId: string): number {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  let d = 0
  let cur: string | null = taskId
  for (let i = 0; i < 64 && cur; i++) {
    const t = byId.get(cur)
    if (!t?.parentId) return d
    d++
    cur = t.parentId
  }
  return d
}

/** `rootId` を根とする部分木の高さ（root から最長の子孫チェーンの長さ。葉のみなら 0） */
export function subtreeHeightBelow(tasks: Task[], rootId: string): number {
  let maxBelow = 0
  const walk = (id: string, depthFromRoot: number) => {
    maxBelow = Math.max(maxBelow, depthFromRoot)
    for (const t of tasks) {
      if (t.parentId === id) walk(t.id, depthFromRoot + 1)
    }
  }
  walk(rootId, 0)
  return maxBelow
}

/** `taskId` を `parentId` の直下に置いたとき、部分木の最大深さが上限を超えないか */
export function canNestUnder(tasks: Task[], taskId: string, parentId: string): boolean {
  if (taskId === parentId) return false
  const parentDepth = taskDepth(tasks, parentId)
  const height = subtreeHeightBelow(tasks, taskId)
  return parentDepth + 1 + height <= MAX_TASK_TREE_DEPTH
}

function isVisibleForIndent(t: Task): boolean {
  return !t.completed && !isLogTask(t)
}

/** 右ドラッグでインデントしたときの親候補（直前の表示兄弟）。不可なら null */
export function getIndentTargetId(tasks: Task[], taskId: string): string | null {
  const task = tasks.find((t) => t.id === taskId)
  if (!task || isLogTask(task)) return null

  const siblings =
    task.parentId == null
      ? tasks.filter((t) => t.parentId == null && t.listId === task.listId && t.sectionId === task.sectionId && isVisibleForIndent(t))
      : tasks.filter((t) => t.parentId === task.parentId && isVisibleForIndent(t))

  const ordered = siblings.sort(compareByOrder).map((t) => t.id)
  const idx = ordered.indexOf(taskId)
  if (idx <= 0) return null
  const prevId = ordered[idx - 1]
  if (!canNestUnder(tasks, taskId, prevId)) return null
  return prevId
}
