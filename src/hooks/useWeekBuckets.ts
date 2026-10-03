import { useMemo } from 'react'
import { isLogTask, type Task } from '../types/task'
import type { TaskList } from '../types/list'
import type { CalendarEvent } from '../types/calendarEvent'
import { logOverlapsDateKey, taskPlacementDate } from '../lib/taskTimeRange'
import { isActiveTask } from '../lib/taskLifecycle'
import { unplannedListIds } from '../lib/listKind'
import { toDateKey } from '../lib/dateKey'

/** 週タイムラインに出すものを日ごとに分ける（終日の ToDo・時刻つきの予定・記録・Google の予定） */
export function useWeekBuckets(tasks: Task[], lists: TaskList[], calendarEvents: CalendarEvent[], days: Date[]) {
  const excludedListIds = useMemo(() => unplannedListIds(lists), [lists])

  const { allDayByDate, timedByDate, timeLogsByDate } = useMemo(() => {
    const allDay = new Map<string, typeof tasks>()
    const timed = new Map<string, typeof tasks>()
    const logs = new Map<string, typeof tasks>()
    for (const t of tasks) {
      if (t.parentId || !isActiveTask(t) || excludedListIds.has(t.listId)) continue
      if (isLogTask(t)) {
        if (!t.dueDate || !t.startTime || !t.endTime) continue
        for (const day of days) {
          const dk = toDateKey(day)
          if (!logOverlapsDateKey(t, dk)) continue
          const arr = logs.get(dk) ?? []
          arr.push(t)
          logs.set(dk, arr)
        }
        continue
      }
      const placement = taskPlacementDate(t)
      if (!placement) continue
      if (t.startTime && t.endTime) {
        const arr = timed.get(placement) ?? []
        arr.push(t)
        timed.set(placement, arr)
      } else {
        const arr = allDay.get(placement) ?? []
        arr.push(t)
        allDay.set(placement, arr)
      }
    }
    return { allDayByDate: allDay, timedByDate: timed, timeLogsByDate: logs }
  }, [tasks, days, excludedListIds])

  const eventsByDate = useMemo(() => {
    const map = new Map<string, typeof calendarEvents>()
    for (const e of calendarEvents) {
      const arr = map.get(e.date) ?? []
      arr.push(e)
      map.set(e.date, arr)
    }
    return map
  }, [calendarEvents])

  return { allDayByDate, timedByDate, timeLogsByDate, eventsByDate }
}
