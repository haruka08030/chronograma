import { isLogTask, type Task } from '../types/task'
import type { PlannedItem } from '../types/plannedItem'
import { taskPlacementDate } from './taskTimeRange'
import { isActiveTask } from './taskLifecycle'

export function scheduledTaskToPlannedItem(t: Task): PlannedItem | null {
  if (!taskPlacementDate(t) || t.parentId || !t.startTime || !t.endTime || isLogTask(t) || !isActiveTask(t)) return null
  return {
    id: `task::${t.id}`,
    summary: t.title,
    startTime: t.startTime,
    endTime: t.endTime,
    source: 'scheduled-task',
  }
}
