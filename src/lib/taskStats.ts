import { isTodoTask, type Task } from '../types/task'
import type { TaskList } from '../types/list'
import { unplannedListIds } from './listKind'
import { isActiveTask } from './taskLifecycle'

export interface TagStats {
  byTag: { tag: string; active: number; completed: number }[]
}

/** 統計画面の「タグ別」の数字（未完了・完了） */
export function computeTagStats(tasks: readonly Task[], lists: readonly TaskList[]): TagStats {
  // 買い物のチェックや Wish で数字が膨らまないよう、やることリストの To-Do だけを数える（予定は完了が無いので数えない）
  const excluded = unplannedListIds(lists)
  const countedTasks = tasks.filter((t) => t.parentId === null && isTodoTask(t) && isActiveTask(t) && !excluded.has(t.listId))

  // 想定ユーザーはリストよりタグ（授業・就活・バイト）で分けるので、タグごとに数える。
  // 複数タグのタスクはそれぞれに数え、タグ無しは最後に 1 行
  const tagCounts = new Map<string, { active: number; completed: number }>()
  for (const task of countedTasks) {
    const key = task.completed ? 'completed' : 'active'
    for (const tag of task.tags.length > 0 ? task.tags : ['']) {
      const c = tagCounts.get(tag) ?? { active: 0, completed: 0 }
      c[key]++
      tagCounts.set(tag, c)
    }
  }
  const byTag = [...tagCounts.entries()]
    .map(([tag, c]) => ({ tag, ...c }))
    .sort((a, b) => (a.tag === '' ? 1 : b.tag === '' ? -1 : b.active - a.active || b.completed - a.completed))

  return { byTag }
}
