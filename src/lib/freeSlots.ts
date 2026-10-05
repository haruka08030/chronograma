import type { Task } from '../types/task'
import type { CalendarEvent } from '../types/calendarEvent'
import { isLogTask } from '../types/task'
import { isActiveTask } from './taskLifecycle'
import { taskPlacementDate } from './taskTimeRange'
import { timeToMinutes } from './clockTime'

/** 0 時からの分で表した、ふさがっている時間 */
export type BusySpan = { start: number; end: number }

const DAY_END = 24 * 60
/** 候補の刻み（15 分。タイムラインのドラッグと同じ） */
const STEP = 15

/**
 * その日のタイムラインでふさがっている時間（時刻つきの予定と Google の予定）。
 * 記録（ログ）はやったことの跡なので数えない（これからの予定の置き場を探すため）。日をまたぐ予定はその日の 24 時まで
 */
export function busySpans(tasks: readonly Task[], events: readonly CalendarEvent[], dateKey: string, excludeId?: string): BusySpan[] {
  const spans: BusySpan[] = []
  const add = (startTime: string, endTime: string) => {
    const start = timeToMinutes(startTime)
    const end = timeToMinutes(endTime)
    spans.push({ start, end: end > start ? end : DAY_END })
  }
  for (const task of tasks) {
    if (task.id === excludeId || !isActiveTask(task) || isLogTask(task)) continue
    if (!task.startTime || !task.endTime || taskPlacementDate(task) !== dateKey) continue
    add(task.startTime, task.endTime)
  }
  for (const e of events) {
    if (e.isAllDay || e.date !== dateKey || !e.startTime || !e.endTime) continue
    add(e.startTime, e.endTime)
  }
  return spans
}

/**
 * `from` 分から後で、`duration` 分の空きが始められる時刻（分）を早い順に `count` 個。
 * 1 つ見つけたらその長さの分だけ先から探す（同じ空きの中で 15 分ずつずらした候補を並べない）
 */
export function findFreeSlots(
  busy: readonly BusySpan[],
  { from, duration, count = 3, until = DAY_END }: { from: number; duration: number; count?: number; until?: number },
): number[] {
  const out: number[] = []
  let t = Math.ceil(from / STEP) * STEP
  while (out.length < count && t + duration <= until) {
    const end = t + duration
    const hit = busy.filter((b) => b.start < end && b.end > t)
    if (hit.length === 0) {
      out.push(t)
      t = end
    } else {
      // ふさがっている所の終わりから探し直す
      t = Math.ceil(Math.max(...hit.map((b) => b.end)) / STEP) * STEP
    }
  }
  return out
}
