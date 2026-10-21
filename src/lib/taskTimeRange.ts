import { isLogTask, type Task, type TaskKind } from '../types/task'
import { HOUR_HEIGHT, SNAP_MINUTES, timeToMinutes } from './timeGrid'
import { minutesToTime } from './clockTime'
import { dateKeyOfDayIndex, dayIndexOf, wallDayDiff, wallMinutes, wallParts, wallSegmentOnDay, type WallInterval } from './wallTime'

const DAY_MINUTES = 24 * 60

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
 * 開始 `placementDate`+`startTime` 〜 終了 `endDate ?? placementDate`+`endTime` の壁時計の区間（通しの分、`wallTime.ts`）。
 * 置く日はタイムログ=`dueDate`、通常タスク=`scheduledDate ?? dueDate`。
 * `endDate` がなく終了時刻が開始以前のとき、記録と 0:00 終わりの予定は翌日まで（+24h）。
 * 端末の Date にしないので、端末の夏時間が切り替わる日も壁時計どおりの長さ・位置になる
 */
export function taskWallInterval(task: Task): WallInterval | null {
  if (!task.startTime || !task.endTime) return null
  const startYmd = taskPlacementDate(task)
  if (!startYmd) return null
  const endYmd = task.endDate ?? startYmd
  const start = wallMinutes(startYmd, task.startTime)
  let end = wallMinutes(endYmd, task.endTime)
  // 記録は終了が開始以前なら翌日まで。予定は 0:00 終わりだけ翌日の 0:00（23:00–0:00 など）
  if (end <= start && !task.endDate && (isLogTask(task) || task.endTime === '00:00')) {
    end += DAY_MINUTES
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
    const iv = taskWallInterval(task as Task)
    if (!iv) return null
    return iv.end - iv.start
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
  const iv = taskWallInterval(task)
  const seg = iv && wallSegmentOnDay(iv, dateKey)
  return seg ? seg.endMin - seg.startMin : 0
}

export function logOverlapsDateKey(task: Task, dateKey: string): boolean {
  if (!isLogTask(task) || !task.dueDate || !task.startTime || !task.endTime || task.parentId) return false
  const iv = taskWallInterval(task)
  return !!iv && wallSegmentOnDay(iv, dateKey) !== null
}

/** その日の列に表示するタイムログの top/height（px）。重ならなければ null */
export function timeLogSegmentLayoutForDay(task: Task, dateKey: string): { top: number; height: number; span: number } | null {
  if (!isLogTask(task) || !task.dueDate || !task.startTime || !task.endTime) return null
  const iv = taskWallInterval(task)
  const seg = iv && wallSegmentOnDay(iv, dateKey)
  if (!seg) return null
  const dur = seg.endMin - seg.startMin
  return {
    top: (seg.startMin / 60) * HOUR_HEIGHT,
    height: (dur / 60) * HOUR_HEIGHT,
    span: (dur / 60) * HOUR_HEIGHT,
  }
}

/**
 * 日をまたぐ記録の開始の日を動かしたときの終わりの日（同じ日数ずらす。終わりの日が開始より前に残らないように）。
 * 終わりの日が無い（同じ日の）記録は null のまま
 */
export function endDateAfterStartDateEdit(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  nextStart: string,
): string | null {
  if (!endDate) return null
  if (!startDate) return endDate
  return dateKeyOfDayIndex(dayIndexOf(endDate) + dayIndexOf(nextStart) - dayIndexOf(startDate))
}

export function isOvernightTimeLog(task: Task): boolean {
  if (!isLogTask(task) || !task.startTime || !task.endTime) return false
  if (task.endDate && task.dueDate && task.endDate !== task.dueDate) return true
  if (!task.dueDate) return timeToMinutes(task.endTime!) <= timeToMinutes(task.startTime!)
  const iv = taskWallInterval(task)
  if (!iv) return false
  return wallDayDiff(iv.end, iv.start) >= 1
}

/**
 * 日をまたぐ記録の、その日の列に描いている区間の時刻（`HH:mm`。日の終わりまでなら終わりは '24:00'）。
 * 端を引いて長さを変えるときは、記録全体ではなくこの区間を元の値にする
 */
export function logSegmentClockOnDay(task: Task, dateKey: string): { startTime: string; endTime: string } | null {
  const iv = taskWallInterval(task)
  return iv ? intervalSegmentClockOnDay(iv, dateKey) : null
}

/** 区間のうち、その日にかかる部分の時刻（`HH:mm`。日の終わりまでなら終わりは '24:00'）。かからなければ null */
export function intervalSegmentClockOnDay(iv: WallInterval, dateKey: string): { startTime: string; endTime: string } | null {
  const seg = wallSegmentOnDay(iv, dateKey)
  return seg ? { startTime: minutesToTime(seg.startMin), endTime: minutesToTime(seg.endMin) } : null
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
  const iv = taskWallInterval(task)
  const seg = logSegmentClockOnDay(task, dateKey)
  if (!iv || !seg) return null
  const at = (hm: string) => wallMinutes(dateKey, hm)
  const start = startTime !== seg.startTime ? at(startTime) : iv.start
  const end = endTime !== seg.endTime ? at(endTime) : iv.end
  if (end <= start) return null
  return logPatchForInterval(start, end)
}

/**
 * 記録の開始・終わり（壁時計の通しの分）を、記録の日付と時刻に直す。日をまたがなければ `endDate` は付けない
 * （翌日の 0:00 ちょうどに終わるときも付けない。終わりが開始以前の記録は翌日まで、で読める）
 */
export function logPatchForInterval(start: number, end: number): Pick<Task, 'dueDate' | 'startTime' | 'endTime' | 'endDate'> {
  const s = wallParts(start)
  const e = wallParts(end)
  const endsAtNextMidnight = e.time === '00:00' && wallDayDiff(end, start) === 1
  return {
    dueDate: s.date,
    startTime: s.time,
    endTime: e.time,
    endDate: e.date !== s.date && !endsAtNextMidnight ? e.date : null,
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
      const start = wallParts(wallMinutes(targetDueDate, newStartTime))
      const end = wallParts(wallMinutes(targetDueDate, newStartTime) + dur)
      return {
        dueDate: start.date,
        startTime: start.time,
        endTime: end.time,
        endDate: end.date !== start.date ? end.date : null,
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
