import { isTodoTask, type Task } from '../types/task'
import type { PlannedItem } from '../types/plannedItem'
import { taskPlacementDate } from './taskTimeRange'
import { isActiveTask } from './taskLifecycle'

/** 時刻つきの To-Do を、記録と突き合わせる予定に。予定（バイト・授業）は Google の予定と同じく突き合わせない */
export function scheduledTaskToPlannedItem(t: Task): PlannedItem | null {
  if (!taskPlacementDate(t) || t.parentId || !t.startTime || !t.endTime || !isTodoTask(t) || !isActiveTask(t)) return null
  return {
    id: `task::${t.id}`,
    summary: t.title,
    startTime: t.startTime,
    endTime: t.endTime,
    source: 'scheduled-task',
  }
}
