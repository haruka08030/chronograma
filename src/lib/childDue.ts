import { isTodoTask, type Task } from '../types/task'
import { isActiveTask } from './taskLifecycle'

/** タスクの並び（ストアの `tasks`）ごとに一度だけ作る、親 → いちばん近い締切の子 */
const cache = new WeakMap<readonly Task[], Map<string, Task>>()

/** 締切の早さ（同じ日なら時刻つきが先、時刻なしはその日の終わり） */
const dueRank = (t: Task) => `${t.dueDate} ${t.dueTime ?? '99:99'}`

function buildIndex(tasks: readonly Task[]): Map<string, Task> {
  const next = new Map<string, Task>()
  for (const t of tasks) {
    if (!t.parentId || !t.dueDate || t.completed || !isTodoTask(t) || !isActiveTask(t)) continue
    const cur = next.get(t.parentId)
    if (!cur || dueRank(t) < dueRank(cur) || (dueRank(t) === dueRank(cur) && t.order < cur.order)) next.set(t.parentId, t)
  }
  return next
}

/**
 * 親の行に出す「次の締切」: まだ終わっていない子（直下）のうち締切がいちばん近いもの（企業の下の ES 締切・面接など）。
 * 締切のある子が無ければ undefined。行ごとに呼んでも、同じ並びなら数え直さない
 */
export function nextChildDue(tasks: readonly Task[], parentId: string): Task | undefined {
  let index = cache.get(tasks)
  if (!index) {
    index = buildIndex(tasks)
    cache.set(tasks, index)
  }
  return index.get(parentId)
}
