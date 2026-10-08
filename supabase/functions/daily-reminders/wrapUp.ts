/**
 * 夜の締めの通知（#299）に載せる、その日の数字。サーバー（Edge Function `index.ts`、Deno）が DB の行から数える。
 * 数え方はアプリの今日の計画（`src/lib/dayPlan.ts` の `getDayPlan`。週のふりかえりの日ごとの完了数・記録時間も同じ）と同じ:
 * - 予定 n 件中 m 件: その日に置いた To-Do（未完了）＋その日に完了した To-Do。予定（授業・バイト）・記録・サブタスク・いつか / チェックリストのリストは入れない
 * - 記録: その日にかかる記録の分（日をまたぐ記録はその日の分だけ）。睡眠は入れない
 * - 残り: その日に置いた未完了の To-Do
 * 同じになることは `wrapUp.test.ts` で `getDayPlan` と突き合わせて確かめる。依存は持たない（どちらからも読めるように）
 */
import { dayWallMs, localNow, wallMs } from './schedule.ts'

/** 数えるのに使うタスクの列（DB の行と同じ名前） */
export interface WrapUpRow {
  id: string
  list_id: string
  parent_id?: string | null
  is_time_log?: boolean | null
  is_sleep?: boolean | null
  is_event?: boolean | null
  completed?: boolean | null
  completed_at?: string | null
  updated_at?: string | null
  scheduled_date?: string | null
  due_date?: string | null
  start_time?: string | null
  end_time?: string | null
  end_date?: string | null
  deleted_at?: string | null
  archived_at?: string | null
}

export interface WrapUpDigest {
  /** その日に完了した To-Do */
  done: number
  /** その日の To-Do（完了＋残り） */
  total: number
  /** その日に置いた未完了の To-Do */
  open: number
  /** その日の記録（分、睡眠を除く） */
  loggedMinutes: number
}

const DAY_MS = 24 * 60 * 60_000

/** 瞬間（ISO）が、そのタイムゾーンのどの日か（`yyyy-MM-dd`）。読めないタイムゾーンは UTC */
export function zonedDateKey(instant: string, timeZone: string): string | null {
  const ms = Date.parse(instant)
  return Number.isFinite(ms) ? localNow(timeZone, new Date(ms)).date : null
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

/** その日（`today`、`timeZone` の壁時計）の数字。`excludedListIds` はいつか / チェックリストのリスト */
export function wrapUpDigest(
  rows: readonly WrapUpRow[],
  today: string,
  timeZone: string,
  excludedListIds: ReadonlySet<string> = new Set(),
): WrapUpDigest {
  let done = 0
  let open = 0
  let loggedMinutes = 0
  for (const row of rows) {
    if (row.deleted_at || row.archived_at) continue
    if (row.is_time_log) {
      if (!row.is_sleep) loggedMinutes += logMinutesOnDay(row, today)
      continue
    }
    if (row.parent_id || excludedListIds.has(row.list_id) || row.is_event) continue
    if (row.completed) {
      // やった日が優先（完了した日。古い保存で完了時刻が無ければ最後に変えた日）
      const at = row.completed_at ?? row.updated_at
      if (at && zonedDateKey(at, timeZone) === today) done++
    } else if ((row.scheduled_date ?? row.due_date ?? null) === today) {
      open++
    }
  }
  return { done, total: done + open, open, loggedMinutes }
}

/**
 * その日の数字に要る行を DB から選ぶ条件（PostgREST の `or`）。ここで多めに取り、`wrapUpDigest` で絞る:
 * その日・前の日に置いたもの（前の日の夜から続く記録）、その日に終わる記録、その日のあたりに完了・更新したもの
 * （タイムゾーンは UTC−12〜+14 なので、その日の 0 時（壁時計）の 15 時間前からの瞬間を取る）
 */
export function wrapUpRowFilter(today: string): string {
  const d0 = dayWallMs(today) ?? 0
  const yesterday = new Date(d0 - DAY_MS).toISOString().slice(0, 10)
  const since = new Date(d0 - 15 * 60 * 60_000).toISOString()
  return [
    `scheduled_date.eq.${today}`,
    `due_date.eq.${today}`,
    `due_date.eq.${yesterday}`,
    `end_date.eq.${today}`,
    `completed_at.gte."${since}"`,
    `and(completed.is.true,completed_at.is.null,updated_at.gte."${since}")`,
  ].join(',')
}
