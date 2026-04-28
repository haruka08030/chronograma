import type { Task } from '../types/task'

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
export function canNestUnder(
  tasks: Task[],
  taskId: string,
  parentId: string,
): boolean {
  if (taskId === parentId) return false
  const parentDepth = taskDepth(tasks, parentId)
  const height = subtreeHeightBelow(tasks, taskId)
  return parentDepth + 1 + height <= MAX_TASK_TREE_DEPTH
}
