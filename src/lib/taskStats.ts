import { startOfMonth, subDays } from 'date-fns'
import { isLogTask, type Task } from '../types/task'
import type { TaskList } from '../types/list'
import { completionDayKey } from './dayPlan'
import { fromDateKey, toDateKey } from './dateKey'
import { unplannedListIds } from './listKind'
import { isActiveTask } from './taskLifecycle'

export interface TaskStats {
  totalActive: number
  completedThisMonth: number
  overdue: number
  /** 今日からさかのぼって、1 件以上完了した日が続いた日数 */
  streak: number
  byTag: { tag: string; active: number; completed: number }[]
}

/**
 * 統計画面のタスクの数字。日付はすべてアプリの日（0 時区切り・アプリのタイムゾーン）で数え、
 * 今日の計画の「完了」と同じ日に入るようにする
 */
export function computeTaskStats(tasks: readonly Task[], lists: readonly TaskList[], todayKey: string): TaskStats {
  // 買い物のチェックや Wish で数字が膨らまないよう、やることリストのタスクだけを数える
  const excluded = unplannedListIds(lists)
  const countedTasks = tasks.filter((t) => t.parentId === null && !isLogTask(t) && isActiveTask(t) && !excluded.has(t.listId))
  const completed = countedTasks.filter((t) => t.completed)
  const active = countedTasks.filter((t) => !t.completed)
  const completedDays = new Set(completed.map(completionDayKey))

  const today = fromDateKey(todayKey)
  const monthStartKey = toDateKey(startOfMonth(today))
  const completedThisMonth = completed.filter((t) => completionDayKey(t) >= monthStartKey).length

  // 想定ユーザーはリストよりタグ（授業・就活・バイト）で分けるので、タグごとに数える。
  // 複数タグのタスクはそれぞれに数え、タグ無しは最後に 1 行
  const tagCounts = new Map<string, { active: number; completed: number }>()
  const bump = (task: Task, key: 'active' | 'completed') => {
    for (const tag of task.tags.length > 0 ? task.tags : ['']) {
      const c = tagCounts.get(tag) ?? { active: 0, completed: 0 }
      c[key]++
      tagCounts.set(tag, c)
    }
  }
  for (const x of active) bump(x, 'active')
  for (const x of completed) bump(x, 'completed')
  const byTag = [...tagCounts.entries()]
    .map(([tag, c]) => ({ tag, ...c }))
    .sort((a, b) => (a.tag === '' ? 1 : b.tag === '' ? -1 : b.active - a.active || b.completed - a.completed))

  const overdue = active.filter((t) => t.dueDate !== null && t.dueDate < todayKey).length

  let streak = 0
  for (let i = 0; i < 365; i++) {
    if (completedDays.has(toDateKey(subDays(today, i)))) streak++
    else break
  }

  return { totalActive: active.length, completedThisMonth, overdue, streak, byTag }
}
