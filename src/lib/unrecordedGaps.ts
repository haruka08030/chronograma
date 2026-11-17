import { isEventTask, isLogTask, isSleepTask, type Task } from '../types/task'
import type { ActiveTimer } from '../store/storeTypes'
import { isActiveTask } from './taskLifecycle'
import { logOverlapsDateKey, logSegmentClockOnDay } from './taskTimeRange'
import { minutesOfDay, timeToMinutes } from './clockTime'
import { toAppWall } from './timeZone'
import { toDateKey } from './dateKey'
import type { LogLimit } from './timelineBlockEdit'
import { planRecordOn } from './planCheck'

/** 0 時からの分で表した区間（終わりは含まない。日の終わりは 1440） */
export type MinuteSpan = { start: number; end: number }

/** これより短い記録の抜けは出さない（細かな移動・休憩まで枠にするとうるさい） */
export const MIN_UNRECORDED_GAP_MINUTES = 30

const DAY_END = 24 * 60

/**
 * その日の「記録の無い時間」。0:00〜24:00（今日は今まで）のうち、記録・睡眠・動いているタイマー・
 * 過ぎた予定（授業・バイト。出たものとして扱う、`busy`）のどれにもかからない `minMinutes` 分以上の所。
 * 睡眠は埋まった時間として数えるだけで、起きた・寝た時刻で範囲を切らない（日をまたいで起きていた夜も出す）。
 * 記録も睡眠もタイマーも無い日（使っていない日）は出さない。
 * - `limitMin` は記録に使える最後の分（今日は今、過ぎた日は null、先の日は 0）。今・これからの時間には出さない
 */
export function unrecordedGaps(
  {
    records,
    sleeps,
    limitMin,
    timer,
    busy = [],
  }: {
    records: readonly MinuteSpan[]
    sleeps: readonly MinuteSpan[]
    limitMin: number | null
    /** 動いているタイマーの、その日にかかる区間（今まで記録している所） */
    timer?: MinuteSpan | null
    /** 予定（授業・バイト）の区間。抜けを埋めるだけ */
    busy?: readonly MinuteSpan[]
  },
  minMinutes = MIN_UNRECORDED_GAP_MINUTES,
): MinuteSpan[] {
  if (limitMin !== null && limitMin <= 0) return []
  if (records.length === 0 && sleeps.length === 0 && !timer) return []
  const from = 0
  const until = limitMin === null ? DAY_END : Math.min(DAY_END, limitMin)
  if (until - from < minMinutes) return []

  const covered = [...records, ...sleeps, ...busy, ...(timer ? [timer] : [])]
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start)
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

/** 記録・予定のその日にかかる区間（分）。日の終わりまで続くものは 1440 */
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
  const start = startKey < dateKey ? 0 : minutesOfDay(wall)
  return start < limitMin ? { start, end: limitMin } : null
}

/** 予定（授業・バイト）のその回を欠席にしたか（`isAbsent`。時間割の欠席の印） */
export type AbsentOn = (title: string, dateKey: string) => boolean

/**
 * その日の予定（授業・バイト）のうち、出たものとして記録の抜けを埋める区間。時刻の無い（終日の）予定・欠席にした回・
 * ゴミ箱やアーカイブ・いつか / チェックリストのリストのもの・記録した予定（✓ 済み。`dayLogs` の記録のほうを正とする）は入れない
 */
export function eventSpansOnDay(
  tasks: readonly Task[],
  dateKey: string,
  absentOn?: AbsentOn,
  excludedListIds: ReadonlySet<string> = new Set(),
  dayLogs: readonly Task[] = [],
): MinuteSpan[] {
  const out: MinuteSpan[] = []
  for (const t of tasks) {
    if (!isEventTask(t) || t.parentId || !t.startTime || !t.endTime || !isActiveTask(t) || excludedListIds.has(t.listId)) continue
    const seg = logSegmentClockOnDay(t, dateKey)
    const span = segmentOnDay(t, dateKey)
    if (!seg || !span) continue
    // 別の時刻で記録した予定は、その記録が実際の時間（予定の時刻は埋めない）
    if (planRecordOn(dayLogs, t.title, seg)) continue
    // 欠席は予定の日（始まった日）の回で見る
    const placed = t.scheduledDate ?? t.dueDate
    if (placed && absentOn?.(t.title, placed)) continue
    out.push(span)
  }
  return out
}

/** その日のタイムラインの記録の列に出している記録（睡眠も）と、予定（`eventSpansOnDay`）から、記録の無い時間を出す */
export function unrecordedGapsForDay(
  dayLogs: readonly Task[],
  dateKey: string,
  limitMin: number | null,
  timer?: ActiveTimer | null,
  busy: readonly MinuteSpan[] = [],
): MinuteSpan[] {
  const records: MinuteSpan[] = []
  const sleeps: MinuteSpan[] = []
  for (const t of dayLogs) {
    const span = segmentOnDay(t, dateKey)
    if (span) (isSleepTask(t) ? sleeps : records).push(span)
  }
  return unrecordedGaps({ records, sleeps, limitMin, timer: timerSpanOnDay(timer, dateKey, limitMin), busy })
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

/** その日の記録の無い時間の合計（分）。1 日の見出しと週のふりかえりで使う（タイムラインの点線の枠と同じ抜け） */
export function unrecordedMinutesOnDay(
  tasks: readonly Task[],
  dateKey: string,
  logLimit: LogLimit,
  timer?: ActiveTimer | null,
  excludedListIds?: ReadonlySet<string>,
  absentOn?: AbsentOn,
): number {
  const dayLogs = logsOnDay(tasks, dateKey, excludedListIds)
  return unrecordedMinutes(
    unrecordedGapsForDay(dayLogs, dateKey, logLimit(dateKey), timer, eventSpansOnDay(tasks, dateKey, absentOn, excludedListIds, dayLogs)),
  )
}
