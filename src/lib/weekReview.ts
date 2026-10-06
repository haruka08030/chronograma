import { addDays, startOfWeek } from 'date-fns'
import { isLogTask, isSleepTask, type Task } from '../types/task'
import type { Habit } from '../types/habit'
import type { PlannedItem } from '../types/plannedItem'
import { getDayPlan } from './dayPlan'
import { habitToPlannedItem } from './habitSlots'
import { isHabitScheduledOnDate } from './habitSchedule'
import { buildHabitRecordIndex, habitDayStatus } from './habitTiming'
import { matchPlanAndActualForDate } from './matchEvents'
import { scheduledTaskToPlannedItem } from './plannedItemUtils'
import { isActiveTask } from './taskLifecycle'
import { logOverlapsDateKey, minutesOfLogOnCalendarDay, taskPlacementDate } from './taskTimeRange'
import { zonedNow } from './timeZone'
import { toDateKey } from './dateKey'
import { clockOf } from './clockTime'

export interface WeekReviewDay {
  dateKey: string
  plannedMinutes: number
  loggedMinutes: number
  done: number
  total: number
  /** 分類ごとの記録時間（多い順、キーは `labelOf`、タグ無しは空文字）。日ごとの棒を分類の色で積む */
  tagMinutes: { tag: string; minutes: number }[]
}

export interface WeekReview {
  days: WeekReviewDay[]
  plannedMinutes: number
  loggedMinutes: number
  done: number
  total: number
  /**
   * 時刻つきの予定（タスク・習慣）のうち、ログと突き合わせて実行できたものの割合。予定が無ければ null。
   * 今日はまだ終わっていない予定を数えない（これから行う予定で「ずれた」と言わない）
   */
  followRate: number | null
  /** 「計画どおり実行」の分母（時間を決めた予定の数）と分子 */
  timedPlanned: number
  followed: number
  habitRate: number | null
  /** ラベルごとの記録時間（多い順、全件。タグ無しは空文字） */
  labelMinutes: { tag: string; minutes: number }[]
}

/** ラベル別の時間を出す行数。これを超えたら 6 行目以降を「その他」にまとめる */
export const LABEL_ROWS = 6

/**
 * ラベル別の時間を `LABEL_ROWS` 行に収める。収まらなければ上位 `LABEL_ROWS - 1` 件と、残りの合計（`others`）。
 * 1 件だけを「その他」にはしない（それなら名前を出したほうが読める）
 */
export function foldLabelMinutes(rows: readonly { tag: string; minutes: number }[]): {
  shown: { tag: string; minutes: number }[]
  others: number
} {
  if (rows.length <= LABEL_ROWS) return { shown: [...rows], others: 0 }
  const shown = rows.slice(0, LABEL_ROWS - 1)
  return { shown, others: rows.slice(LABEL_ROWS - 1).reduce((a, x) => a + x.minutes, 0) }
}

/** `anchor` を含む週（月曜始まり）の振り返り。未来の日は数えない */
export function getWeekReview(
  tasks: readonly Task[],
  habits: readonly Habit[],
  anchor: Date,
  excludedListIds: ReadonlySet<string> = new Set(),
  now = zonedNow(),
  /** 記録のラベル（タグ無しは空文字）。既定は先頭のタグ。画面は `recordLabelKey` で名前の無い色も分ける */
  labelOf: (log: Task) => string = (log) => log.category ?? '',
): WeekReview {
  const start = startOfWeek(anchor, { weekStartsOn: 1 })
  const todayKey = toDateKey(now)
  const nowHm = clockOf(now)
  const days: WeekReviewDay[] = []
  const tagMinutes = new Map<string, number>()
  let timedPlanned = 0
  let followed = 0
  let habitDue = 0
  let habitDone = 0
  const habitRecords = buildHabitRecordIndex(tasks)

  for (let i = 0; i < 7; i++) {
    const date = addDays(start, i)
    const key = toDateKey(date)
    if (key > todayKey) break
    const plan = getDayPlan(tasks, key, excludedListIds)
    const day: WeekReviewDay = {
      dateKey: key,
      plannedMinutes: plan.plannedMinutes,
      loggedMinutes: plan.loggedMinutes,
      done: plan.done.length,
      total: plan.done.length + plan.open.length,
      tagMinutes: [],
    }
    days.push(day)

    const planned: PlannedItem[] = []
    for (const t of tasks) {
      if (taskPlacementDate(t) !== key || excludedListIds.has(t.listId)) continue
      const p = scheduledTaskToPlannedItem(t)
      if (p) planned.push(p)
    }
    for (const h of habits) {
      if (isHabitScheduledOnDate(h, date)) {
        habitDue++
        if (habitDayStatus(h, key, habitRecords) === 'done') habitDone++
      }
      const p = habitToPlannedItem(h, key)
      if (p) planned.push(p)
    }
    const logs = tasks.filter(
      (t) => isLogTask(t) && !t.parentId && t.startTime && t.endTime && isActiveTask(t) && !isSleepTask(t) && logOverlapsDateKey(t, key),
    )
    const dayTagMinutes = new Map<string, number>()
    for (const log of logs) {
      const min = minutesOfLogOnCalendarDay(log, key)
      const label = labelOf(log)
      const tags = log.tags.length > 0 ? log.tags : [label]
      for (const tag of tags) tagMinutes.set(tag, (tagMinutes.get(tag) ?? 0) + min)
      // 棒は 1 本の記録を 1 回だけ積む（複数タグなら先頭のタグの色）
      dayTagMinutes.set(label, (dayTagMinutes.get(label) ?? 0) + min)
    }
    day.tagMinutes = sortedTagMinutes(dayTagMinutes)
    for (const pair of matchPlanAndActualForDate(planned, logs)) {
      if (!pair.planned) continue
      const followedPair = pair.status === 'matched' || pair.status === 'time-drift'
      // 今日の、まだ終わっていない予定（日をまたぐものも含む）は、先に記録できていなければ数えない
      const ended = key < todayKey || (pair.planned.endTime > pair.planned.startTime && pair.planned.endTime <= nowHm)
      if (!ended && !followedPair) continue
      timedPlanned++
      if (followedPair) followed++
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
    followed,
    habitRate: habitDue > 0 ? habitDone / habitDue : null,
    labelMinutes: sortedTagMinutes(tagMinutes),
  }
}

function sortedTagMinutes(m: ReadonlyMap<string, number>): { tag: string; minutes: number }[] {
  return [...m.entries()]
    .map(([tag, minutes]) => ({ tag, minutes }))
    .filter((x) => x.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)
}
