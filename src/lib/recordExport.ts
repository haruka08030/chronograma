import { addDays, endOfMonth, startOfMonth, subMonths } from 'date-fns'
import { isEventTask, isTodoTask, type Task } from '../types/task'
import type { Habit } from '../types/habit'
import { fromDateKey, toDateKey } from './dateKey'
import { pad2 } from './clockTime'
import { buildHabitRecordIndex } from './habitTiming'
import { matchPlanAndActualForDate, type MatchStatus } from './matchEvents'
import { reviewPeriodStart } from './reviewPeriod'
import { isActiveTask } from './taskLifecycle'
import { appTimeZone, instantFromWall, wallInZone } from './timeZone'
import { plannedItemsOnDay } from './weekReview'

/**
 * 記録の書き出し（CSV・ICS、#281）。手元のデータだけから作り、サーバーは使わない。
 * - CSV: 記録・睡眠（列「種類」で分ける）。選べば予定（授業・バイト）と ✓ で終えた時刻つきの To-Do も入れる。
 *   UTF-8 BOM・CRLF（Excel で文字化けしない）。列の名前と日付の書き方（`yyyy-MM-dd`）は CSV の取り込みと同じ
 * - ICS: 記録だけ（睡眠・予定・To-Do は入れない）。時刻は UTC（`Z`）で書く（`TZID` だと `VTIMEZONE` が要る）
 * 日付・時刻の列は画面と同じアプリのタイムゾーンの壁時計。瞬間は書いたタイムゾーン（`timeZoneAnchor`）から出す
 */

/** 書き出す期間。週は月曜はじまり・月は暦の月（ふりかえりと同じ、`reviewPeriod.ts`） */
export type RecordExportPeriod = 'week' | 'month' | 'lastMonth' | 'all'

export interface DateRange {
  /** 最初の日（`yyyy-MM-dd`、含む）。null は制限なし */
  from: string | null
  /** 最後の日（含む）。null は制限なし */
  to: string | null
}

/** 期間 → 日の範囲（`today` はアプリの今日の `yyyy-MM-dd`） */
export function exportPeriodRange(period: RecordExportPeriod, today: string): DateRange {
  const anchor = fromDateKey(today)
  if (period === 'week') {
    const start = reviewPeriodStart('week', anchor)
    return { from: toDateKey(start), to: toDateKey(addDays(start, 6)) }
  }
  if (period === 'month') return { from: toDateKey(startOfMonth(anchor)), to: toDateKey(endOfMonth(anchor)) }
  if (period === 'lastMonth') {
    const prev = subMonths(anchor, 1)
    return { from: toDateKey(startOfMonth(prev)), to: toDateKey(endOfMonth(prev)) }
  }
  return { from: null, to: null }
}

/** 行の種類。記録・睡眠と、選んだときだけの予定・✓ で終えた To-Do */
export type ExportRowKind = 'log' | 'sleep' | 'event' | 'todo'

/** 元の予定の列（予定と突き合わせた結果）。予定に無い記録は `actual-only` */
export type ExportMatch = Exclude<MatchStatus, 'planned-only'>

export interface ExportRow {
  kind: ExportRowKind
  task: Task
  /** 開始日（`yyyy-MM-dd`、アプリのタイムゾーン） */
  date: string
  /** `HH:mm` */
  startTime: string
  endTime: string
  /** 終了日。開始日と同じなら null（日をまたぐ記録だけ） */
  endDate: string | null
  /** 開始・終了の瞬間（ミリ秒） */
  startMs: number
  endMs: number
  minutes: number
  /** 記録だけ。予定・To-Do・睡眠は null */
  match: ExportMatch | null
}

function nextDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d! + 1))
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`
}

/**
 * 時刻のある記録・予定の瞬間。記録は終了が開始以前なら翌日まで、予定は 0:00 終わりだけ翌日
 * （`taskTimedInterval` と同じ決まり。こちらは端末ではなく書いたタイムゾーンで瞬間を出す）
 */
export function exportInterval(task: Task, zone: string = appTimeZone()): { startMs: number; endMs: number } | null {
  const isRecord = task.kind === 'log' || task.kind === 'sleep'
  const date = isRecord ? task.dueDate : task.scheduledDate
  if (!date || !task.startTime || !task.endTime) return null
  const tz = task.timeZoneAnchor ?? zone
  const rollsOver = !task.endDate && task.endTime <= task.startTime && (isRecord || task.endTime === '00:00')
  const endDay = task.endDate ?? (rollsOver ? nextDay(date) : date)
  const startMs = instantFromWall(date, task.startTime, tz)
  const endMs = instantFromWall(endDay, task.endTime, tz)
  return endMs > startMs ? { startMs, endMs } : null
}

function inRange(date: string, range: DateRange): boolean {
  return (range.from === null || date >= range.from) && (range.to === null || date <= range.to)
}

export interface CollectOptions {
  range: DateRange
  /** 予定（授業・バイト）と ✓ で終えた時刻つきの To-Do も入れるか（CSV だけ） */
  includePlans: boolean
  /** いつか・チェックリストのリスト（`unplannedListIds`）。ここの To-Do・予定は入れない */
  excludedListIds: ReadonlySet<string>
  /** 日付・時刻の列のタイムゾーン（既定はアプリのタイムゾーン） */
  zone?: string
}

/** 期間の行を古い順に。記録には予定と突き合わせた結果（ふりかえりと同じ予定の集まり）を付ける */
export function collectExportRows(tasks: readonly Task[], habits: readonly Habit[], opts: CollectOptions): ExportRow[] {
  const zone = opts.zone ?? appTimeZone()
  const rows: ExportRow[] = []
  for (const task of tasks) {
    if (task.parentId || !isActiveTask(task)) continue
    let kind: ExportRowKind
    if (task.kind === 'log' || task.kind === 'sleep') kind = task.kind
    else if (!opts.includePlans || opts.excludedListIds.has(task.listId)) continue
    else if (isEventTask(task)) kind = 'event'
    else if (isTodoTask(task) && task.completed) kind = 'todo'
    else continue
    const iv = exportInterval(task, zone)
    if (!iv) continue
    const start = wallInZone(iv.startMs, zone)
    if (!inRange(start.date, opts.range)) continue
    const end = wallInZone(iv.endMs, zone)
    rows.push({
      kind,
      task,
      date: start.date,
      startTime: start.time,
      endTime: end.time,
      endDate: end.date !== start.date ? end.date : null,
      startMs: iv.startMs,
      endMs: iv.endMs,
      minutes: Math.round((iv.endMs - iv.startMs) / 60_000),
      match: null,
    })
  }

  // 記録を開始日ごとに、その日の予定と突き合わせる
  const logsByDay = new Map<string, ExportRow[]>()
  for (const r of rows) {
    if (r.kind !== 'log') continue
    const list = logsByDay.get(r.date) ?? []
    list.push(r)
    logsByDay.set(r.date, list)
  }
  if (logsByDay.size > 0) {
    const habitRecords = buildHabitRecordIndex(tasks)
    for (const [day, dayRows] of logsByDay) {
      const planned = plannedItemsOnDay(tasks, habits, day, opts.excludedListIds, habitRecords).map((p) => p.item)
      const byId = new Map(dayRows.map((r) => [r.task.id, r]))
      for (const pair of matchPlanAndActualForDate(
        planned,
        dayRows.map((r) => r.task),
      )) {
        const row = pair.actual && byId.get(pair.actual.id)
        if (row && pair.status !== 'planned-only') row.match = pair.status
      }
    }
  }

  const kindOrder: Record<ExportRowKind, number> = { log: 0, sleep: 1, event: 2, todo: 3 }
  return rows.sort((a, b) => a.startMs - b.startMs || kindOrder[a.kind] - kindOrder[b.kind] || a.task.id.localeCompare(b.task.id))
}

/* ---------- CSV ---------- */

export interface CsvTexts {
  /** 見出しの行（並び: 種類・日付・開始・終了・終了日・分・ラベル・タイトル・タグ・元の予定） */
  headers: readonly string[]
  kind: (kind: ExportRowKind) => string
  match: (match: ExportMatch) => string
}

/** CSV の 1 つの値。カンマ・引用符・改行・前後の空白を含むなら引用符で囲む */
export function csvCell(value: string): string {
  return /[",\r\n]|^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/**
 * 自由に書ける文字（題名・ラベル・タグ）の値。表計算が式として読む先頭（= + - @ タブ・CR）なら ' を前に付ける
 * （CSV インジェクション対策。開いた表計算で式が動かないように）
 */
export function csvTextCell(value: string): string {
  return csvCell(/^[=+\-@\t\r]/.test(value) ? `'${value}` : value)
}

export interface RecordCsvInput {
  rows: readonly ExportRow[]
  texts: CsvTexts
  /** 記録のラベルの表示名（ラベル名 → 名前の無い色の名前。ラベルなしは空） */
  labelOf: (task: Task) => string
}

/** 記録の CSV（UTF-8 BOM・CRLF） */
export function buildRecordsCsv({ rows, texts, labelOf }: RecordCsvInput): string {
  const lines = [texts.headers.map(csvCell).join(',')]
  for (const r of rows) {
    const label = labelOf(r.task)
    // 記録の tags は分類を写したものなので、ラベルと同じものは除く
    const tags = r.task.tags.filter((tag) => !(r.task.category && tag === r.task.category))
    lines.push(
      [
        csvCell(texts.kind(r.kind)),
        r.date,
        r.startTime,
        r.endTime,
        r.endDate ?? '',
        String(r.minutes),
        csvTextCell(label),
        csvTextCell(r.task.title),
        csvTextCell(tags.join(', ')),
        r.match ? csvCell(texts.match(r.match)) : '',
      ].join(','),
    )
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

/* ---------- ICS ---------- */

/** ICS の TEXT の値（RFC 5545 3.3.11）。\ ; , と改行を逃がす */
export function icsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

const encoder = new TextEncoder()

/**
 * 1 行を 75 オクテットごとに折り返す（RFC 5545 3.1）。続きの行は空白 1 つで始める（空白も 75 に数える）。
 * 文字（UTF-8 の複数バイト・サロゲートペア）の途中では切らない
 */
export function foldIcsLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line
  const out: string[] = []
  let current = ''
  let bytes = 0
  for (const ch of line) {
    const size = encoder.encode(ch).length
    const limit = out.length === 0 ? 75 : 74
    if (bytes + size > limit) {
      out.push(current)
      current = ''
      bytes = 0
    }
    current += ch
    bytes += size
  }
  out.push(current)
  return out.join('\r\n ')
}

/** 瞬間 → `20261008T093000Z` */
export function icsUtc(ms: number): string {
  const d = new Date(ms)
  return (
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
    `T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`
  )
}

export interface RecordIcsInput {
  rows: readonly ExportRow[]
  labelOf: (task: Task) => string
  /** 題名の無い記録の SUMMARY（ラベルも無いとき） */
  untitled: string
  /** カレンダーの名前（`X-WR-CALNAME`） */
  calendarName: string
  /** 書き出した瞬間（`DTSTAMP`） */
  now: number
}

/**
 * 記録の ICS。記録 1 件を 1 つの VEVENT に（記録だけ。睡眠・予定・To-Do は入れない）。
 * UID は記録の id から作るので、同じ期間を書き出し直して取り込んでも重ならない
 */
export function buildRecordsIcs({ rows, labelOf, untitled, calendarName, now }: RecordIcsInput): string {
  const stamp = icsUtc(now)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Chronograma//Records//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(calendarName)}`,
  ]
  for (const r of rows) {
    if (r.kind !== 'log') continue
    const label = labelOf(r.task)
    const title = r.task.title.trim() || label || untitled
    lines.push('BEGIN:VEVENT', `UID:record-${r.task.id}@chronograma`, `DTSTAMP:${stamp}`)
    lines.push(`DTSTART:${icsUtc(r.startMs)}`, `DTEND:${icsUtc(r.endMs)}`, `SUMMARY:${icsText(title)}`)
    if (label) lines.push(`CATEGORIES:${icsText(label)}`)
    if (r.task.description.trim()) lines.push(`DESCRIPTION:${icsText(r.task.description)}`)
    if (r.task.location?.trim()) lines.push(`LOCATION:${icsText(r.task.location)}`)
    const modified = Date.parse(r.task.updatedAt)
    if (Number.isFinite(modified)) lines.push(`LAST-MODIFIED:${icsUtc(modified)}`)
    lines.push('TRANSP:TRANSPARENT', 'END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`
}
