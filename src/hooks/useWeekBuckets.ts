import { useMemo, useState } from 'react'
import { isLogTask, type Task } from '../types/task'
import type { TaskList } from '../types/list'
import type { CalendarEvent } from '../types/calendarEvent'
import { logOverlapsDateKey } from '../lib/taskTimeRange'
import { isActiveTask } from '../lib/taskLifecycle'
import { unplannedListIds } from '../lib/listKind'
import { toDateKey } from '../lib/dateKey'
import { googleEventDateKeys } from '../lib/googleEventSpan'
import { sameRows } from './useStableRows'
import { calendarDayKey, dueMarkDayKey, keepsTimeSlot } from '../lib/dayPlan'

type Buckets<T> = Map<string, T[]>

/**
 * 中身（行の参照と並び）が前と同じ日は、前の配列を使い回す（`next` を書き換える）。
 * 日の列は `memo` なので、変わっていない日の列を描き直さない（#265）
 */
export function keepUnchangedDays<T>(prev: Buckets<T> | undefined, next: Buckets<T>): Buckets<T> {
  if (!prev) return next
  for (const [key, arr] of next) {
    const old = prev.get(key)
    if (old && sameRows(old, arr)) next.set(key, old)
  }
  return next
}

/** 種類（終日・締切・時刻つき・記録）ごとに前の結果を覚え、変わっていない日の配列を使い回す */
function createDayArrayCache() {
  const prev = new Map<string, Buckets<Task>>()
  return (name: string, next: Buckets<Task>): Buckets<Task> => {
    const out = keepUnchangedDays(prev.get(name), next)
    prev.set(name, out)
    return out
  }
}

/** 週タイムラインに出すものを日ごとに分ける（終日の ToDo・時刻つきの予定・記録・Google の予定） */
export function useWeekBuckets(tasks: Task[], lists: TaskList[], calendarEvents: CalendarEvent[], days: Date[]) {
  const excludedListIds = useMemo(() => unplannedListIds(lists), [lists])
  /** 前に分けた結果と比べて、変わっていない日の配列を使い回す */
  const [stabilize] = useState(createDayArrayCache)

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
      if (dueKey) {
        const arr = due.get(dueKey) ?? []
        arr.push(t)
        due.set(dueKey, arr)
      }
      // 完了したものは終わらせた日へ。時刻つきも予定の日以外に終えたなら、終えた日の終日の行に出す
      const key = calendarDayKey(t)
      if (!key) continue
      const bucket = keepsTimeSlot(t) ? timed : allDay
      const arr = bucket.get(key) ?? []
      arr.push(t)
      bucket.set(key, arr)
    }
    const next = {
      allDay: stabilize('allDay', allDay),
      due: stabilize('due', due),
      timed: stabilize('timed', timed),
      logs: stabilize('logs', logs),
    }
    return { allDayByDate: next.allDay, timedByDate: next.timed, timeLogsByDate: next.logs, dueByDate: next.due }
  }, [tasks, days, excludedListIds, stabilize])

  const eventsByDate = useMemo(() => {
    const map = new Map<string, typeof calendarEvents>()
    for (const e of calendarEvents) {
      const arr = map.get(e.date) ?? []
      arr.push(e)
      map.set(e.date, arr)
    }
    return map
  }, [calendarEvents])

  /** タイムラインの列に描く時刻つきの Google の予定。日をまたぐ予定は重なる日すべてに入れる（記録と同じ） */
  const timedEventsByDate = useMemo(() => {
    const map = new Map<string, typeof calendarEvents>()
    for (const e of calendarEvents) {
      if (e.isAllDay || !e.startTime || !e.endTime) continue
      for (const dk of googleEventDateKeys(e)) {
        const arr = map.get(dk) ?? []
        arr.push(e)
        map.set(dk, arr)
      }
    }
    return map
  }, [calendarEvents])

  return { allDayByDate, timedByDate, timeLogsByDate, eventsByDate, timedEventsByDate, dueByDate }
}
