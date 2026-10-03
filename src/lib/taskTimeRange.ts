import { addMinutes, differenceInCalendarDays, differenceInMinutes, endOfDay, max, min, startOfDay } from 'date-fns'
import type { Task } from '../types/task'
import { HOUR_HEIGHT, SNAP_MINUTES, timeToMinutes } from './timeGrid'
import { clockOf } from './clockTime'
import { toDateKey } from './dateKey'

const DAY_MINUTES = 24 * 60

/** `yyyy-MM-dd` + `HH:mm` をローカル暦の Date に（DST 境界はブラウザ実装に従う） */
export function ymdHmToLocalDate(ymd: string, hm: string): Date {
  const [y, mo, da] = ymd.split('-').map((x) => Number(x))
  const [hh, mm] = hm.split(':').map((x) => Number(x))
  return new Date(y, mo - 1, da, hh, Number.isFinite(mm) ? mm : 0, 0, 0)
}

function dateKeyToNoon(ymd: string): Date {
  const [y, mo, da] = ymd.split('-').map((x) => Number(x))
  return new Date(y, mo - 1, da, 12, 0, 0, 0)
}

/**
 * タスクをカレンダー/タイムラインに置く日（`yyyy-MM-dd`）。
 * - タイムログ: `dueDate`（開始日）
 * - 通常タスク: `scheduledDate`（予定日）。無ければ `dueDate`（期限日）にフォールバック
 */
export function taskPlacementDate(task: {
  dueDate?: string | null
  scheduledDate?: string | null
  isTimeLog?: boolean
}): string | null {
  if (task.isTimeLog === true) return task.dueDate ?? null
  return task.scheduledDate ?? task.dueDate ?? null
}

/**
 * 開始 `placementDate`+`startTime` 〜 終了 `endDate ?? placementDate`+`endTime`。
 * 置く日はタイムログ=`dueDate`、通常タスク=`scheduledDate ?? dueDate`。
 * `isTimeLog` で `endDate` がなく終了時刻が開始以前のときは従来どおり翌日まで（+24h）。
 */
export function taskTimedInterval(task: Task): { start: Date; end: Date } | null {
  if (!task.startTime || !task.endTime) return null
  const startYmd = taskPlacementDate(task)
  if (!startYmd) return null
  const endYmd = task.endDate ?? startYmd
  const start = ymdHmToLocalDate(startYmd, task.startTime)
  let end = ymdHmToLocalDate(endYmd, task.endTime)
  if (end <= start && task.isTimeLog === true && !task.endDate) {
    end = addMinutes(end, DAY_MINUTES)
  }
  if (end <= start) return null
  return { start, end }
}

/** 分換算。日付なしタスクは壁時計のみ（タイムログで負なら +24h） */
export function durationMinutesForTaskSlot(task: {
  dueDate?: string | null
  scheduledDate?: string | null
  endDate?: string | null
  startTime?: string | null
  endTime?: string | null
  isTimeLog?: boolean
}): number | null {
  if (!task.startTime || !task.endTime) return null
  if (taskPlacementDate(task)) {
    const iv = taskTimedInterval(task as Task)
    if (!iv) return null
    return differenceInMinutes(iv.end, iv.start)
  }
  let diff = timeToMinutes(task.endTime) - timeToMinutes(task.startTime)
  if (task.isTimeLog === true && diff < 0) diff += DAY_MINUTES
  return diff
}

export function durationMinutesForTaskId(tasks: Task[], taskId: string): number | null {
  const t = tasks.find((x) => x.id === taskId)
  return t ? durationMinutesForTaskSlot(t) : null
}

/** その暦日にかかるログの分数（サマリー用） */
export function minutesOfLogOnCalendarDay(task: Task, dateKey: string): number {
  if (task.isTimeLog !== true) return 0
  const iv = taskTimedInterval(task)
  if (!iv) return 0
  const day = dateKeyToNoon(dateKey)
  const d0 = startOfDay(day)
  const d1 = endOfDay(day)
  const segStart = max([iv.start, d0])
  const segEnd = min([iv.end, d1])
  if (segEnd <= segStart) return 0
  return differenceInMinutes(segEnd, segStart)
}

export function compareLogsOnDay(a: Task, b: Task, dateKey: string): number {
  const la = timeLogSegmentLayoutForDay(a, dateKey)
  const lb = timeLogSegmentLayoutForDay(b, dateKey)
  if (!la && !lb) return 0
  if (!la) return 1
  if (!lb) return -1
  return la.top - lb.top
}

export function logOverlapsDateKey(task: Task, dateKey: string): boolean {
  if (task.isTimeLog !== true || !task.dueDate || !task.startTime || !task.endTime || task.parentId) return false
  const iv = taskTimedInterval(task)
  if (!iv) return false
  const day = dateKeyToNoon(dateKey)
  const d0 = startOfDay(day)
  const d1 = endOfDay(day)
  return iv.start < d1 && iv.end > d0
}

/** その日の列に表示するタイムログの top/height（px）。重ならなければ null */
export function timeLogSegmentLayoutForDay(
  task: Task,
  dateKey: string,
): { top: number; height: number } | null {
  if (task.isTimeLog !== true || !task.dueDate || !task.startTime || !task.endTime) return null
  const iv = taskTimedInterval(task)
  if (!iv) return null
  const day = dateKeyToNoon(dateKey)
  const d0 = startOfDay(day)
  const d1 = endOfDay(day)
  const segStart = max([iv.start, d0])
  const segEnd = min([iv.end, d1])
  if (segEnd <= segStart) return null
  const startMin = differenceInMinutes(segStart, d0)
  const endMin = differenceInMinutes(segEnd, d0)
  const dur = endMin - startMin
  if (dur <= 0) return null
  return {
    top: (startMin / 60) * HOUR_HEIGHT,
    height: Math.max((dur / 60) * HOUR_HEIGHT, HOUR_HEIGHT / 4),
  }
}

export function isOvernightTimeLog(task: Task): boolean {
  if (task.isTimeLog !== true || !task.startTime || !task.endTime) return false
  if (task.endDate && task.dueDate && task.endDate !== task.dueDate) return true
  if (!task.dueDate) return timeToMinutes(task.endTime!) <= timeToMinutes(task.startTime!)
  const iv = taskTimedInterval(task)
  if (!iv) return false
  return differenceInCalendarDays(iv.end, iv.start) >= 1
}

/** タイムラインでブロックを動かしたあとの日付・時刻（ログは長さを維持） */
/** ドラッグ移動用のブロック長（分） */
export function dragBlockDurationMinutes(task: {
  startTime: string
  endTime: string
  isTimeLog?: boolean
  dueDate?: string | null
  endDate?: string | null
}): number {
  const d = durationMinutesForTaskSlot(task as Task)
  if (d != null && d > 0) return d
  const raw = timeToMinutes(task.endTime) - timeToMinutes(task.startTime)
  return raw > 0 ? raw : SNAP_MINUTES
}

export function patchAfterTimelineMove(
  task: Task,
  targetDueDate: string,
  newStartTime: string,
  _newEndTimeFromHook: string,
): Partial<Pick<Task, 'dueDate' | 'scheduledDate' | 'startTime' | 'endTime' | 'endDate'>> {
  if (task.isTimeLog === true) {
    const dur = durationMinutesForTaskSlot(task)
    if (dur != null && dur > 0) {
      const start = ymdHmToLocalDate(targetDueDate, newStartTime)
      const end = addMinutes(start, dur)
      const due = toDateKey(start)
      const ed = toDateKey(end)
      const st = clockOf(start)
      const et = clockOf(end)
      return {
        dueDate: due,
        startTime: st,
        endTime: et,
        endDate: ed !== due ? ed : null,
      }
    }
  }
  // 通常タスクはカレンダー上で「予定日」を動かす（期限 `dueDate` は変えない）
  return {
    scheduledDate: targetDueDate,
    startTime: newStartTime,
    endTime: _newEndTimeFromHook,
  }
}
