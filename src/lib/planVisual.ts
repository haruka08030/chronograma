import type { Task } from '../types/task'
import { NEUTRAL_HEX } from './googleColors'
import { zonedNow } from './timeZone'

/**
 * カレンダー上の予定の見せ方。このアプリは「記録と可視化」が主役なので、色で目立つのは記録（実績）だけ。
 * 予定は薄く（`.gc-plan`）、時間が過ぎたら完了・未完了とも灰色（`.gc-missed`、完了は ✓ 付き）。
 * - done: 完了した予定 / missed: 終わったのに未完了 / upcoming: これから
 */
export type PlanVisualState = 'done' | 'missed' | 'upcoming'

export function planVisualState(
  task: Pick<Task, 'completed' | 'endTime' | 'startTime'>,
  dateKey: string,
  now = zonedNow(),
): PlanVisualState {
  if (task.completed) return 'done'
  const [y, m, d] = dateKey.split('-').map(Number)
  // 時刻つきは終了時刻、時刻なし（終日）はその日の終わりを過ぎたら「終わった」
  const end = task.endTime
    ? new Date(y!, m! - 1, d!, ...task.endTime.split(':').map(Number) as [number, number])
    : new Date(y!, m! - 1, d! + 1)
  return end.getTime() < now.getTime() ? 'missed' : 'upcoming'
}

/** カレンダーでの予定の色: タスク自身の色（Google の予定から作ったものなど）→ リストの色 */
export function planHex(task: Pick<Task, 'color' | 'listId'>, listColorById: ReadonlyMap<string, string>): string {
  return task.color || listColorById.get(task.listId) || NEUTRAL_HEX
}
