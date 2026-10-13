import { isLogTask, isSleepTask, type Task } from '../types/task'
import type { ActiveTimer } from '../store/storeTypes'
import { isActiveTask } from './taskLifecycle'
import { logOverlapsDateKey, logSegmentClockOnDay } from './taskTimeRange'
import { timeToMinutes } from './clockTime'
import { toAppWall } from './timeZone'
import { toDateKey } from './dateKey'
import type { LogLimit } from './timelineBlockEdit'

/** 0 時からの分で表した区間（終わりは含まない。日の終わりは 1440） */
export type MinuteSpan = { start: number; end: number }

/** これより短い記録の抜けは出さない（細かな移動・休憩まで枠にするとうるさい） */
export const MIN_UNRECORDED_GAP_MINUTES = 30

const DAY_END = 24 * 60
/** この時刻より前に始まった睡眠は「夜の睡眠（朝に起きた）」とみなす */
const MORNING_END = 12 * 60
/** この時刻以降に始まった睡眠（と日の終わりまで続く睡眠）は「寝た」とみなす。それより前の昼の睡眠は昼寝（記録と同じ扱い） */
const NIGHT_START = 18 * 60

/**
 * その日の「記録の無い時間」。起きてから寝るまで（今日は今まで）のうち、記録・睡眠・動いているタイマーの
 * どれにもかからない `minMinutes` 分以上の所。
 * - 起きた時刻: 朝（12 時より前に始まった）の睡眠のうち最初のものの終わり。無ければ記録の最初
 * - 寝た時刻: 夜（18 時以降に始まった・日の終わりまで続く）の睡眠のうち最初のものの始まり。無ければ記録の最後（今日は今）
 * - `limitMin` は記録に使える最後の分（今日は今、過ぎた日は null、先の日は 0）。今・これからの時間には出さない
 */
export function unrecordedGaps(
  {
    records,
    sleeps,
    limitMin,
    timer,
  }: {
    records: readonly MinuteSpan[]
    sleeps: readonly MinuteSpan[]
    limitMin: number | null
    /** 動いているタイマーの、その日にかかる区間（今まで記録している所） */
    timer?: MinuteSpan | null
  },
  minMinutes = MIN_UNRECORDED_GAP_MINUTES,
): MinuteSpan[] {
  if (limitMin !== null && limitMin <= 0) return []
  const morning = sleeps.filter((s) => s.start < MORNING_END).sort((a, b) => a.start - b.start)[0]
  const night = sleeps
    .filter((s) => s.start >= NIGHT_START || (s.end >= DAY_END && s.start >= MORNING_END))
    .sort((a, b) => a.start - b.start)[0]
  const firstRecord = records.length > 0 ? Math.min(...records.map((r) => r.start)) : null
  const lastRecord = records.length > 0 ? Math.max(...records.map((r) => r.end)) : null

  const from = morning?.end ?? firstRecord
  if (from === null) return []
  let until = night?.start ?? (limitMin === null ? lastRecord : DAY_END)
  if (until === null) return []
  if (limitMin !== null) until = Math.min(until, limitMin)
  if (until - from < minMinutes) return []

  const covered = [...records, ...sleeps, ...(timer ? [timer] : [])].filter((s) => s.end > s.start).sort((a, b) => a.start - b.start)
  const gaps: MinuteSpan[] = []
  let cursor = from
  for (const c of covered) {
    if (c.start >= until) break
    if (c.start > cursor) gaps.push({ start: cursor, end: c.start })
    cursor = Math.max(cursor, c.end)
  }
  if (cursor < until) gaps.push({ start: cursor, end: until })
  return gaps.filter((g) => g.end - g.start >= minMinutes)
}

/** 記録のその日にかかる区間（分）。日の終わりまで続くものは 1440 */
function segmentOnDay(task: Task, dateKey: string): MinuteSpan | null {
  const seg = logSegmentClockOnDay(task, dateKey)
  if (!seg) return null
  const start = timeToMinutes(seg.startTime)
  const end = timeToMinutes(seg.endTime)
  return end > start ? { start, end } : null
}

/** 動いているタイマーの、その日にかかる区間（今まで）。かからなければ null */
export function timerSpanOnDay(timer: ActiveTimer | null | undefined, dateKey: string, limitMin: number | null): MinuteSpan | null {
  if (!timer || limitMin === null || limitMin <= 0) return null
  const ms = new Date(timer.startedAt).getTime()
  if (!Number.isFinite(ms)) return null
  const wall = toAppWall(ms)
  const startKey = toDateKey(wall)
  if (startKey > dateKey) return null
  const start = startKey < dateKey ? 0 : wall.getHours() * 60 + wall.getMinutes()
  return start < limitMin ? { start, end: limitMin } : null
}

/** その日のタイムラインの記録の列に出している記録（睡眠も）から、記録の無い時間を出す */
export function unrecordedGapsForDay(
  dayLogs: readonly Task[],
  dateKey: string,
  limitMin: number | null,
  timer?: ActiveTimer | null,
): MinuteSpan[] {
  const records: MinuteSpan[] = []
  const sleeps: MinuteSpan[] = []
  for (const t of dayLogs) {
    const span = segmentOnDay(t, dateKey)
    if (span) (isSleepTask(t) ? sleeps : records).push(span)
  }
  return unrecordedGaps({ records, sleeps, limitMin, timer: timerSpanOnDay(timer, dateKey, limitMin) })
}

/** その日にかかる記録（睡眠も。タイムラインの記録の列と同じ選び方） */
export function logsOnDay(tasks: readonly Task[], dateKey: string, excludedListIds: ReadonlySet<string> = new Set()): Task[] {
  return tasks.filter(
    (t) => !t.parentId && isLogTask(t) && isActiveTask(t) && !excludedListIds.has(t.listId) && logOverlapsDateKey(t, dateKey),
  )
}

/** 記録の無い時間の合計（分） */
export function unrecordedMinutes(gaps: readonly MinuteSpan[]): number {
  return gaps.reduce((sum, g) => sum + (g.end - g.start), 0)
}

/** その日の記録の無い時間の合計（分）。1 日の見出しと週のふりかえりで使う */
export function unrecordedMinutesOnDay(
  tasks: readonly Task[],
  dateKey: string,
  logLimit: LogLimit,
  timer?: ActiveTimer | null,
  excludedListIds?: ReadonlySet<string>,
): number {
  return unrecordedMinutes(unrecordedGapsForDay(logsOnDay(tasks, dateKey, excludedListIds), dateKey, logLimit(dateKey), timer))
}
