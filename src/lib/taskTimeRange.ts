import { addDays, addMinutes, differenceInCalendarDays, differenceInMinutes, max, min, startOfDay } from 'date-fns'
import { isLogTask, type Task, type TaskKind } from '../types/task'
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
export function taskPlacementDate(task: { dueDate?: string | null; scheduledDate?: string | null; kind?: TaskKind }): string | null {
  if (isLogTask(task)) return task.dueDate ?? null
  return task.scheduledDate ?? task.dueDate ?? null
}

/**
 * 開始 `placementDate`+`startTime` 〜 終了 `endDate ?? placementDate`+`endTime`。
 * 置く日はタイムログ=`dueDate`、通常タスク=`scheduledDate ?? dueDate`。
 * `endDate` がなく終了時刻が開始以前のとき、記録と 0:00 終わりの予定は翌日まで（+24h）。
 */
export function taskTimedInterval(task: Task): { start: Date; end: Date } | null {
  if (!task.startTime || !task.endTime) return null
  const startYmd = taskPlacementDate(task)
  if (!startYmd) return null
  const endYmd = task.endDate ?? startYmd
  const start = ymdHmToLocalDate(startYmd, task.startTime)
  let end = ymdHmToLocalDate(endYmd, task.endTime)
  // 記録は終了が開始以前なら翌日まで。予定は 0:00 終わりだけ翌日の 0:00（23:00–0:00 など）
  if (end <= start && !task.endDate && (isLogTask(task) || task.endTime === '00:00')) {
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
  kind?: TaskKind
}): number | null {
  if (!task.startTime || !task.endTime) return null
  if (taskPlacementDate(task)) {
    const iv = taskTimedInterval(task as Task)
    if (!iv) return null
    return differenceInMinutes(iv.end, iv.start)
  }
  let diff = timeToMinutes(task.endTime) - timeToMinutes(task.startTime)
  if (isLogTask(task) && diff < 0) diff += DAY_MINUTES
  return diff
}

/** タイムラインに置くときの長さ: 時間があればその長さ、無ければ見積もり（どちらも無ければ null＝既定の予定の長さ） */
export function durationMinutesForTaskId(tasks: Task[], taskId: string): number | null {
  const t = tasks.find((x) => x.id === taskId)
  return t ? (durationMinutesForTaskSlot(t) ?? t.estimateMinutes ?? null) : null
}

/** その暦日にかかるログの分数（サマリー用） */
export function minutesOfLogOnCalendarDay(task: Task, dateKey: string): number {
  if (!isLogTask(task)) return 0
  const iv = taskTimedInterval(task)
  if (!iv) return 0
  const day = dateKeyToNoon(dateKey)
  const d0 = startOfDay(day)
  const d1 = startOfDay(addDays(day, 1))
  const segStart = max([iv.start, d0])
  const segEnd = min([iv.end, d1])
  if (segEnd <= segStart) return 0
  return differenceInMinutes(segEnd, segStart)
}

export function logOverlapsDateKey(task: Task, dateKey: string): boolean {
  if (!isLogTask(task) || !task.dueDate || !task.startTime || !task.endTime || task.parentId) return false
  const iv = taskTimedInterval(task)
  if (!iv) return false
  const day = dateKeyToNoon(dateKey)
  const d0 = startOfDay(day)
  const d1 = startOfDay(addDays(day, 1))
  return iv.start < d1 && iv.end > d0
}

/** その日の列に表示するタイムログの top/height（px）。重ならなければ null */
export function timeLogSegmentLayoutForDay(task: Task, dateKey: string): { top: number; height: number; span: number } | null {
  if (!isLogTask(task) || !task.dueDate || !task.startTime || !task.endTime) return null
  const iv = taskTimedInterval(task)
  if (!iv) return null
  const day = dateKeyToNoon(dateKey)
  const d0 = startOfDay(day)
  const d1 = startOfDay(addDays(day, 1))
  const segStart = max([iv.start, d0])
  const segEnd = min([iv.end, d1])
  if (segEnd <= segStart) return null
  const startMin = differenceInMinutes(segStart, d0)
  const endMin = differenceInMinutes(segEnd, d0)
  const dur = endMin - startMin
  if (dur <= 0) return null
  return {
    top: (startMin / 60) * HOUR_HEIGHT,
    height: (dur / 60) * HOUR_HEIGHT,
    span: (dur / 60) * HOUR_HEIGHT,
  }
}

export function isOvernightTimeLog(task: Task): boolean {
  if (!isLogTask(task) || !task.startTime || !task.endTime) return false
  if (task.endDate && task.dueDate && task.endDate !== task.dueDate) return true
  if (!task.dueDate) return timeToMinutes(task.endTime!) <= timeToMinutes(task.startTime!)
  const iv = taskTimedInterval(task)
  if (!iv) return false
  return differenceInCalendarDays(iv.end, iv.start) >= 1
}

/**
 * 日をまたぐ記録の、その日の列に描いている区間の時刻（`HH:mm`。日の終わりまでなら終わりは '24:00'）。
 * 端を引いて長さを変えるときは、記録全体ではなくこの区間を元の値にする
 */
export function logSegmentClockOnDay(task: Task, dateKey: string): { startTime: string; endTime: string } | null {
  const iv = taskTimedInterval(task)
  if (!iv) return null
  const d0 = startOfDay(dateKeyToNoon(dateKey))
  const d1 = startOfDay(addDays(d0, 1))
  const segStart = max([iv.start, d0])
  const segEnd = min([iv.end, d1])
  if (segEnd <= segStart) return null
  const minutesOf = (d: Date) => differenceInMinutes(d, d0)
  const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  return { startTime: hm(minutesOf(segStart)), endTime: hm(minutesOf(segEnd)) }
}

/**
 * 日をまたぐ記録の端を、ある日の列で引いたあとの日付と時刻。`startTime` / `endTime` はその日の列での区間（'24:00' は日の終わり）。
 * 引いた側の端だけをその日のその時刻にし、もう一方の端は元のまま。日をまたがなくなったら `endDate` を外す
 */
export function patchAfterLogResize(
  task: Task,
  dateKey: string,
  startTime: string,
  endTime: string,
): Pick<Task, 'dueDate' | 'startTime' | 'endTime' | 'endDate'> | null {
  const iv = taskTimedInterval(task)
  const seg = logSegmentClockOnDay(task, dateKey)
  if (!iv || !seg) return null
  const at = (hm: string) => addMinutes(startOfDay(dateKeyToNoon(dateKey)), timeToMinutes(hm))
  const start = startTime !== seg.startTime ? at(startTime) : iv.start
  const end = endTime !== seg.endTime ? at(endTime) : iv.end
  if (end <= start) return null
  const dueDate = toDateKey(start)
  // 翌日の 0:00 ちょうどに終わるなら endDate は付けない（終わりが開始以前の記録は翌日まで、で読める）
  const endsAtNextMidnight = clockOf(end) === '00:00' && differenceInCalendarDays(end, start) === 1
  const endKey = toDateKey(end)
  return {
    dueDate,
    startTime: clockOf(start),
    endTime: clockOf(end),
    endDate: endKey !== dueDate && !endsAtNextMidnight ? endKey : null,
  }
}

/** タイムラインでブロックを動かしたあとの日付・時刻（ログは長さを維持） */
/** ドラッグ移動用のブロック長（分） */
export function dragBlockDurationMinutes(task: {
  startTime: string
  endTime: string
  kind?: TaskKind
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
  if (isLogTask(task)) {
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
