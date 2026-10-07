import { isEventTask, isTodoTask, type Task } from '../types/task'
import type { PlannedItem } from '../types/plannedItem'
import { taskPlacementDate } from './taskTimeRange'
import { isActiveTask } from './taskLifecycle'

/**
 * 時刻つきの To-Do・予定（バイト・授業）を、記録と突き合わせる予定に。
 * 予定は突き合わせに入れて、その時間にした記録を「予定に無かった記録」にしない（完了・計画どおりの分母には入れない。`source` で分かる）
 */
export function scheduledTaskToPlannedItem(t: Task): PlannedItem | null {
  if (!taskPlacementDate(t) || t.parentId || !t.startTime || !t.endTime || !isActiveTask(t)) return null
  if (!isTodoTask(t) && !isEventTask(t)) return null
  return {
    id: `task::${t.id}`,
    summary: t.title,
    startTime: t.startTime,
    endTime: t.endTime,
    source: isEventTask(t) ? 'scheduled-event' : 'scheduled-task',
    taskId: t.id,
    completed: isTodoTask(t) && t.completed,
  }
}
