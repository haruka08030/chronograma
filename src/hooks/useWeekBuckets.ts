import { useMemo } from 'react'
import { isLogTask, type Task } from '../types/task'
import type { TaskList } from '../types/list'
import type { CalendarEvent } from '../types/calendarEvent'
import { logOverlapsDateKey } from '../lib/taskTimeRange'
import { isActiveTask } from '../lib/taskLifecycle'
import { unplannedListIds } from '../lib/listKind'
import { toDateKey } from '../lib/dateKey'
import { calendarDayKey, dueMarkDayKey, keepsTimeSlot } from '../lib/dayPlan'

/** 週タイムラインに出すものを日ごとに分ける（終日の ToDo・時刻つきの予定・記録・Google の予定） */
export function useWeekBuckets(tasks: Task[], lists: TaskList[], calendarEvents: CalendarEvent[], days: Date[]) {
  const excludedListIds = useMemo(() => unplannedListIds(lists), [lists])

  const { allDayByDate, timedByDate, timeLogsByDate, dueByDate } = useMemo(() => {
    const allDay = new Map<string, typeof tasks>()
    /** 締切の日の印（実行日が別の日のもの） */
    const due = new Map<string, typeof tasks>()
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
      const dueKey = dueMarkDayKey(t)
      if (dueKey) due.set(dueKey, [...(due.get(dueKey) ?? []), t])
      // 完了したものは終わらせた日へ。時刻つきも予定の日以外に終えたなら、終えた日の終日の行に出す
      const key = calendarDayKey(t)
      if (!key) continue
      const bucket = keepsTimeSlot(t) ? timed : allDay
      const arr = bucket.get(key) ?? []
      arr.push(t)
      bucket.set(key, arr)
    }
    return { allDayByDate: allDay, timedByDate: timed, timeLogsByDate: logs, dueByDate: due }
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

  return { allDayByDate, timedByDate, timeLogsByDate, eventsByDate, dueByDate }
}
