import { addDays, format, startOfWeek } from 'date-fns'
import type { Task } from '../types/task'
import type { Habit } from '../types/habit'
import type { PlannedItem } from '../types/plannedItem'
import { getDayPlan } from './dayPlan'
import { habitToPlannedItem } from './habitSlots'
import { isHabitScheduledOnDate } from './habitSchedule'
import { matchPlanAndActualForDate } from './matchEvents'
import { scheduledTaskToPlannedItem } from './plannedItemUtils'
import { isActiveTask } from './taskLifecycle'
import { logOverlapsDateKey, minutesOfLogOnCalendarDay, taskPlacementDate } from './taskTimeRange'

export interface WeekReviewDay {
  dateKey: string
  plannedMinutes: number
  loggedMinutes: number
  done: number
  total: number
}

export interface WeekReview {
  days: WeekReviewDay[]
  plannedMinutes: number
  loggedMinutes: number
  done: number
  total: number
  /** 時刻つきの予定（タスク・習慣）のうち、ログと突き合わせて実行できたものの割合。予定が無ければ null */
  followRate: number | null
  timedPlanned: number
  habitRate: number | null
  /** 記録時間の多いタグ（タグ無しは空文字） */
  topTags: { tag: string; minutes: number }[]
}

/** `anchor` を含む週（月曜始まり）の振り返り。未来の日は数えない */
export function getWeekReview(
  tasks: readonly Task[],
  habits: readonly Habit[],
  anchor: Date,
  excludedListIds: ReadonlySet<string> = new Set(),
  now = new Date(),
): WeekReview {
  const start = startOfWeek(anchor, { weekStartsOn: 1 })
  const todayKey = format(now, 'yyyy-MM-dd')
  const days: WeekReviewDay[] = []
  const tagMinutes = new Map<string, number>()
  let timedPlanned = 0
  let followed = 0
  let habitDue = 0
  let habitDone = 0

  for (let i = 0; i < 7; i++) {
    const date = addDays(start, i)
    const key = format(date, 'yyyy-MM-dd')
    if (key > todayKey) break
    const plan = getDayPlan(tasks, key, excludedListIds)
    days.push({
      dateKey: key,
      plannedMinutes: plan.plannedMinutes,
      loggedMinutes: plan.loggedMinutes,
      done: plan.done.length,
      total: plan.done.length + plan.open.length,
    })

    const planned: PlannedItem[] = []
    for (const t of tasks) {
      if (taskPlacementDate(t) !== key || excludedListIds.has(t.listId)) continue
      const p = scheduledTaskToPlannedItem(t)
      if (p) planned.push(p)
    }
    for (const h of habits) {
      if (isHabitScheduledOnDate(h, date)) {
        habitDue++
        if (h.completedDates.includes(key)) habitDone++
      }
      const p = habitToPlannedItem(h, key)
      if (p) planned.push(p)
    }
    const logs = tasks.filter(
      (t) => t.isTimeLog && !t.parentId && t.startTime && t.endTime && isActiveTask(t) && logOverlapsDateKey(t, key),
    )
    for (const log of logs) {
      const min = minutesOfLogOnCalendarDay(log, key)
      const tags = log.tags.length > 0 ? log.tags : ['']
      for (const tag of tags) tagMinutes.set(tag, (tagMinutes.get(tag) ?? 0) + min)
    }
    for (const pair of matchPlanAndActualForDate(planned, logs)) {
      if (!pair.planned) continue
      timedPlanned++
      if (pair.status === 'matched' || pair.status === 'time-drift') followed++
    }
  }

  const sum = (f: (d: WeekReviewDay) => number) => days.reduce((a, d) => a + f(d), 0)
  return {
    days,
    plannedMinutes: sum((d) => d.plannedMinutes),
    loggedMinutes: sum((d) => d.loggedMinutes),
    done: sum((d) => d.done),
    total: sum((d) => d.total),
    followRate: timedPlanned > 0 ? followed / timedPlanned : null,
    timedPlanned,
    habitRate: habitDue > 0 ? habitDone / habitDue : null,
    topTags: [...tagMinutes.entries()]
      .map(([tag, minutes]) => ({ tag, minutes }))
      .filter((x) => x.minutes > 0)
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 5),
  }
}
