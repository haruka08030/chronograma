import type { Task } from '../types/task'

/**
 * カレンダー上の予定の見せ方。このアプリは「記録と可視化」が主役なので、
 * - done: 完了した予定 → 色のまま（✓ 付き）。やったことが色で残る
 * - missed: 終わったのに完了していない予定 → グレー（予定の役目は終わった）
 * - upcoming: これからの予定 → 色
 * 記録（ログ）はいつも分類の色（この関数の対象外）。
 */
export type PlanVisualState = 'done' | 'missed' | 'upcoming'

export function planVisualState(
  task: Pick<Task, 'completed' | 'endTime' | 'startTime'>,
  dateKey: string,
  now = new Date(),
): PlanVisualState {
  if (task.completed) return 'done'
  const [y, m, d] = dateKey.split('-').map(Number)
  // 時刻つきは終了時刻、時刻なし（終日）はその日の終わりを過ぎたら「終わった」
  const end = task.endTime
    ? new Date(y!, m! - 1, d!, ...task.endTime.split(':').map(Number) as [number, number])
    : new Date(y!, m! - 1, d! + 1)
  return end.getTime() < now.getTime() ? 'missed' : 'upcoming'
}
