/**
 * 夜のまとめの通知（#299）と朝のまとめの「昨日」の行（#278）に載せる、その日の数字。サーバー（Edge Function `index.ts`、Deno）が DB の行から数える。
 * - 予定 N 件中 M 件・予定外: 今日の計画の見出し・週のふりかえりと同じ数え方（`_shared/dayResult.ts` の `countDayResult`）
 * - 記録: その日にかかる記録の分（日をまたぐ記録はその日の分だけ）。睡眠は入れない
 * 同じになることは `wrapUp.test.ts` でアプリの `getDayReviews` と突き合わせて確かめる。依存は `_shared` だけ（アプリからも読めるように）
 */
import { dayWallMs, wallDate, wallMs } from './schedule.ts'
import { countDayResult, habitPlanSlot, type LogSlot, type PlanSlot, type SlotHabit } from '../_shared/dayResult.ts'
import { indexHabitRecords, type TimingRecord } from '../_shared/habitTiming.ts'

/** 数えるのに使うタスクの列（DB の行と同じ名前） */
export interface WrapUpRow {
  id: string
  list_id: string
  title?: string | null
  parent_id?: string | null
  is_time_log?: boolean | null
  is_sleep?: boolean | null
  is_event?: boolean | null
  completed?: boolean | null
  scheduled_date?: string | null
  due_date?: string | null
  start_time?: string | null
  end_time?: string | null
  end_date?: string | null
  source_task_id?: string | null
  habit_id?: string | null
  /** その日から別の日へ移した予定の控え（`[{ date, startTime, endTime, to }]`） */
  moved_plans?: unknown
  deleted_at?: string | null
  archived_at?: string | null
}

/** 数えるのに使う習慣の列（DB の行と同じ名前） */
export interface WrapUpHabitRow {
  id: string
  title?: string | null
  time_mode?: string | null
  start_time?: string | null
  end_time?: string | null
  frequency?: unknown
  completed_dates?: unknown
  time_overrides?: unknown
  weekday_times?: unknown
  rest_dates?: unknown
  goal_minutes?: number | null
  archived_at?: string | null
  deleted_at?: string | null
}

export interface WrapUpDigest {
  /** 予定 N 件（時間に置いた To-Do・習慣の枠のうち、数えたもの） */
  planned: number
  /** そのうち記録と合った・✓ で終えた数 */
  followed: number
  /** 予定外: 予定に無かった記録の時間（分） */
  unplannedMinutes: number
  /** その日の記録（分、睡眠を除く） */
  loggedMinutes: number
}

const DAY_MS = 24 * 60 * 60_000

/** 前の日（`yyyy-MM-dd`）。朝のまとめの「昨日」（#278） */
export function previousDay(date: string): string {
  return wallDate((dayWallMs(date) ?? 0) - DAY_MS)
}

/** 次の日（`yyyy-MM-dd`） */
function nextDay(date: string): string {
  return wallDate((dayWallMs(date) ?? 0) + DAY_MS)
}

/** その日に数えた予定か記録があったか。どちらも無い日は朝のまとめに昨日の行を出さない（#278） */
export function hasDayNumbers(d: WrapUpDigest): boolean {
  return d.planned > 0 || d.loggedMinutes > 0
}

/**
 * 記録のうち、その日（`today`）にかかる分。記録の日は `due_date`、終わりは `end_date ?? due_date`。
 * `end_date` が無く終わりが始まり以前なら翌日まで（アプリの `taskTimedInterval` と同じ）。
 * 壁時計で数える（夏時間の切り替わりをまたぐ記録だけ、アプリと 1 時間ずれることがある）
 */
export function logMinutesOnDay(row: WrapUpRow, today: string): number {
  if (!row.due_date || !row.start_time || !row.end_time) return 0
  const start = wallMs(row.due_date, row.start_time)
  let end = wallMs(row.end_date ?? row.due_date, row.end_time)
  if (start == null || end == null) return 0
  if (end <= start && !row.end_date) end += DAY_MS
  if (end <= start) return 0
  const d0 = dayWallMs(today)
  if (d0 == null) return 0
  const segStart = Math.max(start, d0)
  const segEnd = Math.min(end, d0 + DAY_MS)
  return segEnd > segStart ? Math.round((segEnd - segStart) / 60_000) : 0
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/

const isStringArray = (raw: unknown): raw is string[] => Array.isArray(raw) && raw.every((x) => typeof x === 'string')

/** `{ "yyyy-MM-dd" | 曜日: { startTime, endTime } }` を読む（アプリの `readHabitTimeOverrides` / `readHabitWeekdayTimes` と同じ形） */
function readTimes(raw: unknown, key: RegExp): Record<string, { startTime: string; endTime: string | null }> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const out: Record<string, { startTime: string; endTime: string | null }> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!key.test(k) || !v || typeof v !== 'object') continue
    const { startTime, endTime } = v as Record<string, unknown>
    if (typeof startTime !== 'string' || !CLOCK.test(startTime)) continue
    out[k] = { startTime, endTime: typeof endTime === 'string' && CLOCK.test(endTime) ? endTime : null }
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/** 習慣の行を数え方の形に（アプリの `rowToHabit` と同じ読み方）。ゴミ箱の習慣は null */
export function habitFromRow(row: WrapUpHabitRow): SlotHabit | null {
  if (row.deleted_at) return null
  const f = (row.frequency ?? {}) as Record<string, unknown>
  const frequency: SlotHabit['frequency'] =
    f.type === 'weekly' && Array.isArray(f.weekdays)
      ? { type: 'weekly', weekdays: f.weekdays.filter((d): d is 1 | 2 | 3 | 4 | 5 | 6 | 7 => Number.isInteger(d) && d >= 1 && d <= 7) }
      : f.type === 'timesPerWeek' && typeof f.count === 'number' && Number.isFinite(f.count)
        ? { type: 'timesPerWeek', count: Math.min(6, Math.max(1, Math.round(f.count))) }
        : { type: 'daily' }
  const has = (t: string | null | undefined) => typeof t === 'string' && t.trim().length > 0
  const timeMode =
    row.time_mode === 'none' || row.time_mode === 'fixed' || row.time_mode === 'range'
      ? row.time_mode
      : has(row.start_time) && has(row.end_time)
        ? 'range'
        : has(row.start_time)
          ? 'fixed'
          : 'none'
  const goal = row.goal_minutes
  return {
    id: row.id,
    title: row.title ?? '',
    timeMode,
    startTime: row.start_time ?? null,
    endTime: row.end_time ?? null,
    frequency,
    completedDates: isStringArray(row.completed_dates) ? row.completed_dates : [],
    timeOverrides: readTimes(row.time_overrides, DATE_KEY),
    weekdayTimes: readTimes(row.weekday_times, /^[1-7]$/),
    restDates: isStringArray(row.rest_dates) ? row.rest_dates : undefined,
    goalMinutes: typeof goal === 'number' && Number.isInteger(goal) && goal >= 1 && goal <= 1440 ? goal : undefined,
    archivedAt: row.archived_at ?? null,
  }
}

const isActiveRow = (row: WrapUpRow) => !row.deleted_at && !row.archived_at

/** 記録の行を習慣の判定・突き合わせの形に */
const recordOf = (row: WrapUpRow): TimingRecord & LogSlot => ({
  id: row.id,
  title: row.title ?? '',
  habitId: row.habit_id ?? null,
  sourceTaskId: row.source_task_id ?? null,
  dueDate: row.due_date ?? null,
  startTime: row.start_time ?? null,
  endTime: row.end_time ?? null,
  endDate: row.end_date ?? null,
})

/** その日から移した予定の控え（形の合わないものは捨てる） */
function movedPlansOn(raw: unknown, date: string): { startTime: string; endTime: string }[] {
  if (!Array.isArray(raw)) return []
  const out: { startTime: string; endTime: string }[] = []
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue
    const r = x as Record<string, unknown>
    if (r.date !== date || typeof r.to !== 'string' || !DATE_KEY.test(r.to)) continue
    if (typeof r.startTime === 'string' && CLOCK.test(r.startTime) && typeof r.endTime === 'string' && CLOCK.test(r.endTime)) {
      out.push({ startTime: r.startTime, endTime: r.endTime })
    }
  }
  return out
}

/**
 * その日（`day`）の数字。`now` は利用者のタイムゾーンの今（今日はまだ終わっていない予定を数えない）。
 * `excludedListIds` はいつか / チェックリストのリスト
 */
export function wrapUpDigest(
  rows: readonly WrapUpRow[],
  habitRows: readonly WrapUpHabitRow[],
  day: string,
  now: { date: string; minutes: number },
  excludedListIds: ReadonlySet<string> = new Set(),
): WrapUpDigest {
  const planned: PlanSlot[] = []
  const logs: (TimingRecord & LogSlot)[] = []
  /** 記録の id → その日にかかる分 */
  const logMinutes = new Map<string, number>()
  let loggedMinutes = 0
  for (const row of rows) {
    const active = isActiveRow(row)
    if (row.is_time_log) {
      if (!active || row.is_sleep || row.parent_id) continue
      const minutes = logMinutesOnDay(row, day)
      loggedMinutes += minutes
      if (minutes > 0 && row.start_time && row.end_time) {
        logs.push(recordOf(row))
        logMinutes.set(row.id, minutes)
      }
      continue
    }
    if (!active || excludedListIds.has(row.list_id)) continue
    // 時間に置いた To-Do・予定（アプリの `scheduledTaskToPlannedItem` と同じ。サブタスクは入れない）
    if ((row.scheduled_date ?? row.due_date ?? null) === day && !row.parent_id && row.start_time && row.end_time) {
      planned.push({
        id: `task::${row.id}`,
        summary: row.title ?? '',
        startTime: row.start_time,
        endTime: row.end_time,
        source: row.is_event ? 'scheduled-event' : 'scheduled-task',
        taskId: row.id,
        completed: !row.is_event && row.completed === true,
      })
    }
    // その日から別の日へ移した予定（やらなかった予定として数える。アプリの `movedPlanToPlannedItem`）
    for (const plan of movedPlansOn(row.moved_plans, day)) {
      planned.push({
        id: `moved::${row.id}::${day}`,
        summary: row.title ?? '',
        startTime: plan.startTime,
        endTime: plan.endTime,
        source: 'scheduled-task',
        taskId: row.id,
        completed: false,
      })
    }
  }
  const records = indexHabitRecords(
    rows.filter((r) => r.is_time_log && !r.parent_id).map((r) => ({ ...recordOf(r), active: isActiveRow(r) })),
    (r) => r.active,
  )
  for (const row of habitRows) {
    const habit = habitFromRow(row)
    const slot = habit && habitPlanSlot(habit, day, records)
    if (slot) planned.push(slot)
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  const result = countDayResult(planned, logs, {
    dateKey: day,
    todayKey: now.date,
    nowHm: `${pad(Math.floor(now.minutes / 60))}:${pad(now.minutes % 60)}`,
    logMinutes: (log) => logMinutes.get(log.id) ?? 0,
  })
  return { planned: result.planned, followed: result.followed, unplannedMinutes: result.unplannedMinutes, loggedMinutes }
}

/**
 * その日の数字に要る行を DB から選ぶ条件（PostgREST の `or`）。ここで多めに取り、`wrapUpDigest` で絞る:
 * その日に置いたもの、前の日・次の日の記録（日をまたぐ記録と、夜遅く・朝早くの習慣の記録）、その日に終わる記録。
 * その日から移した予定（`moved_plans`）は別に読む（`index.ts`）
 */
export function wrapUpRowFilter(today: string): string {
  return [
    `scheduled_date.eq.${today}`,
    `due_date.eq.${today}`,
    `due_date.eq.${previousDay(today)}`,
    `due_date.eq.${nextDay(today)}`,
    `end_date.eq.${today}`,
  ].join(',')
}
