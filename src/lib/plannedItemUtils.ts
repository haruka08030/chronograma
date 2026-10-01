import type { CalendarEvent } from '../types/calendarEvent'
import type { Task } from '../types/task'
import type { PlannedItem } from '../types/plannedItem'
import { taskPlacementDate } from './taskTimeRange'
import { isActiveTask } from './taskLifecycle'

export function calendarEventToPlannedItem(e: CalendarEvent): PlannedItem | null {
  if (!e.startTime || !e.endTime) return null
  return {
    id: e.id,
    summary: e.summary,
    startTime: e.startTime,
    endTime: e.endTime,
    source: 'google',
    color: e.color,
  }
}

export function scheduledTaskToPlannedItem(t: Task): PlannedItem | null {
  if (!taskPlacementDate(t) || t.parentId || !t.startTime || !t.endTime || t.isTimeLog || !isActiveTask(t)) return null
  return {
    id: `task::${t.id}`,
    summary: t.title,
    startTime: t.startTime,
    endTime: t.endTime,
    source: 'scheduled-task',
  }
}
