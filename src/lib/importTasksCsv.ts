import type { Priority } from '../types/task'
import { appTimeZone, isValidTimeZone, wallInZone } from './timeZone'

export interface CsvTaskDraft {
  title: string
  dueDate: string | null
  /** 締切の時刻（`HH:mm`、アプリのタイムゾーン）。終日なら null */
  dueTime: string | null
  listName: string | null
  completed: boolean
  /** 完了した時刻（ISO）。CSV に無ければ null */
  completedAt: string | null
  priority: Priority
  tags: string[]
  description: string
}

export interface CsvParseResult {
  rows: CsvTaskDraft[]
  skipped: number
  errors: string[]
}

export interface CsvParseOptions {
  /** 読んだファイルの名前。Todoist の CSV はプロジェクト名が中に無いので、ファイル名をリスト名にする */
  fileName?: string
}

type Column = keyof CsvTaskDraft | 'ignore' | 'rowType' | 'deadline' | 'timeZone' | 'allDay'

const HEADER_ALIASES: Record<string, Column> = {
  title: 'title',
  name: 'title',
  task: 'title',
  タイトル: 'title',
  名前: 'title',
  due: 'dueDate',
  due_date: 'dueDate',
  duedate: 'dueDate',
  date: 'dueDate',
  期限: 'dueDate',
  日付: 'dueDate',
  締切: 'dueDate',
  期日: 'dueDate',
  deadline: 'deadline',
  list: 'listName',
  list_name: 'listName',
  project: 'listName',
  リスト: 'listName',
  completed: 'completed',
  done: 'completed',
  status: 'completed',
  完了: 'completed',
  completed_time: 'completedAt',
  priority: 'priority',
  優先度: 'priority',
  tags: 'tags',
  tag: 'tags',
  labels: 'tags',
  タグ: 'tags',
  notes: 'description',
  note: 'description',
  description: 'description',
  content: 'description',
  memo: 'description',
  メモ: 'description',
  説明: 'description',
  type: 'rowType',
  timezone: 'timeZone',
  is_all_day: 'allDay',
}

/** 書き出したアプリ。値の読み方（優先度の数字・完了の数字・日時）が違う */
type CsvFormat = 'todoist' | 'ticktick' | 'plain'

/** 見出しを探す行数（TickTick のバックアップは見出しの上に「Date: / Version: / Status:」の説明行がある） */
const HEADER_SEARCH_ROWS = 10
function normalizeHeader(cell: string): string {
  return cell.trim().toLowerCase().replace(/\s+/g, '_')
}

/** Minimal RFC-style CSV row parser (quoted fields, commas). */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  const pushCell = () => {
    row.push(cell)
    cell = ''
  }
  const pushRow = () => {
    if (row.length > 0 || cell.length > 0) {
      pushCell()
      rows.push(row)
    }
    row = []
  }

  const s = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cell += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === ',') {
      pushCell()
      continue
    }
    if (ch === '\n') {
      pushRow()
      continue
    }
    if (ch === '\r') {
      if (s[i + 1] === '\n') i++
      pushRow()
      continue
    }
    cell += ch
  }
  if (cell.length > 0 || row.length > 0) pushRow()
  return rows
}

function parseBool(raw: string): boolean {
  const v = raw.trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'y' || v === '完了' || v === 'done'
}

/** TickTick の Status: 0 未完了・1 完了・2 完了してアーカイブ */
function parseCompleted(raw: string, format: CsvFormat): boolean {
  if (format === 'ticktick' && raw.trim() === '2') return true
  return parseBool(raw)
}

function parsePriority(raw: string, format: CsvFormat): Priority {
  const v = raw.trim().toLowerCase()
  // Todoist: 1（p1・いちばん高い）〜 4（p4・優先度なし）
  if (format === 'todoist') return ({ '1': 'high', '2': 'medium', '3': 'low' } as const)[v] ?? 'none'
  // TickTick: 0 なし・1 低・3 中・5 高
  if (format === 'ticktick') return ({ '1': 'low', '3': 'medium', '5': 'high' } as const)[v] ?? 'none'
  if (v === 'none' || v === 'なし') return 'none'
  if (v === 'low' || v === '低') return 'low'
  if (v === 'high' || v === '高') return 'high'
  if (v === 'medium' || v === '中') return 'medium'
  return 'none'
}

function parseTags(raw: string): string[] {
  return raw
    .split(/[;,]/)
    .map((t) => t.trim())
    .filter(Boolean)
}

const pad2 = (n: number | string) => String(n).padStart(2, '0')

interface DueParts {
  date: string
  time: string | null
}

interface DateContext {
  /** 時差の無い日時を UTC として読む（TickTick） */
  noOffsetIsUtc: boolean
  /** その行のタイムゾーン（TickTick の Timezone）。終日の日付はこのゾーンで読む */
  rowZone: string | null
  /** 終日か（TickTick の Is All Day）。空なら null */
  allDay: boolean | null
}

const ISO_LIKE = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/

function offsetMinutes(raw: string): number {
  if (raw === 'Z') return 0
  const m = raw.match(/^([+-])(\d{2}):?(\d{2})$/)!
  const v = Number(m[2]) * 60 + Number(m[3])
  return m[1] === '-' ? -v : v
}

/** 瞬間 → 締切。終日なら行のゾーンの日付だけ、時刻つきならアプリのタイムゾーンの日付と時刻 */
function dueFromInstant(at: number, ctx: DateContext): DueParts {
  const zone = ctx.rowZone ?? appTimeZone()
  const wallInRowZone = wallInZone(at, zone)
  const allDay = ctx.allDay ?? wallInRowZone.time === '00:00'
  if (allDay) return { date: wallInRowZone.date, time: null }
  const wall = wallInZone(at, appTimeZone())
  return { date: wall.date, time: wall.time }
}

/** 日付・日時を読む。読めなければ null（「every day」「tomorrow」のような言葉の日付も） */
function parseDue(raw: string, ctx: DateContext): DueParts | null {
  const v = raw.trim()
  if (!v) return null
  const iso = v.match(ISO_LIKE)
  if (iso) {
    const [, y, mo, d, h, mi, sec, off] = iso
    const month = Number(mo)
    const day = Number(d)
    if (month < 1 || month > 12 || day < 1 || day > 31) return null
    const date = `${y}-${pad2(mo!)}-${pad2(d!)}`
    if (h === undefined) return { date, time: null }
    if (off !== undefined || ctx.noOffsetIsUtc) {
      const utc = Date.UTC(Number(y), month - 1, day, Number(h), Number(mi), Number(sec ?? 0))
      return dueFromInstant(utc - (off ? offsetMinutes(off) : 0) * 60_000, ctx)
    }
    return { date, time: `${pad2(h)}:${mi}` }
  }
  // 「Oct 2 2026 17:00」のような英語の日付は端末の読み方に任せる（年の無いものは読まない）
  if (!/\d{4}/.test(v)) return null
  const parsed = new Date(v)
  if (Number.isNaN(parsed.getTime())) return null
  const date = `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`
  const hasTime = /\d{1,2}:\d{2}/.test(v)
  return { date, time: hasTime ? `${pad2(parsed.getHours())}:${pad2(parsed.getMinutes())}` : null }
}

function parseInstant(raw: string, noOffsetIsUtc: boolean): string | null {
  const v = raw.trim()
  const iso = v.match(ISO_LIKE)
  if (!iso || iso[4] === undefined) return null
  const [, y, mo, d, h, mi, sec, off] = iso
  if (off === undefined && !noOffsetIsUtc) return null
  const utc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(sec ?? 0))
  const at = utc - (off ? offsetMinutes(off) : 0) * 60_000
  return Number.isNaN(at) ? null : new Date(at).toISOString()
}

/** Todoist は題名の中に「@ラベル」でラベルを書く。題名から外してタグにする */
const TODOIST_LABEL = /(^|\s)@([\p{L}\p{N}_-]+)/gu

function splitTodoistLabels(title: string): { title: string; labels: string[] } {
  const labels = [...title.matchAll(TODOIST_LABEL)].map((m) => m[2]!)
  if (labels.length === 0) return { title, labels }
  return {
    title: title
      .replace(TODOIST_LABEL, '$1')
      .replace(/\s{2,}/g, ' ')
      .trim(),
    labels,
  }
}

/** Todoist のファイル名（「仕事.csv」、バックアップの zip の中は「仕事 [2203306141].csv」）からプロジェクト名 */
function projectNameFromFile(fileName: string | undefined): string | null {
  if (!fileName) return null
  const base = fileName
    .replace(/^.*[\\/]/, '')
    .replace(/\.csv$/i, '')
    .replace(/\s*\[\d+\]$/, '')
    .trim()
  return base || null
}

function findHeader(table: string[][]): number {
  const limit = Math.min(table.length, HEADER_SEARCH_ROWS)
  for (let i = 0; i < limit; i++) {
    const cols = table[i]!.map((c) => HEADER_ALIASES[normalizeHeader(c)])
    if (cols.includes('title')) return i
    // Todoist は CONTENT が題名
    if (cols.includes('rowType') && cols.includes('description')) return i
  }
  return -1
}

export function parseTasksCsv(text: string, options: CsvParseOptions = {}): CsvParseResult {
  const table = parseCsvRows(text)
  const errors: string[] = []
  if (table.length === 0) {
    return { rows: [], skipped: 0, errors: ['empty'] }
  }

  const headerIndex = findHeader(table)
  const firstRow = table[0]!.map((c) => normalizeHeader(c))
  const looksLikeHeader = firstRow.some((h) => HEADER_ALIASES[h] !== undefined)
  if (headerIndex < 0 && looksLikeHeader) {
    errors.push('missing_title_column')
    return { rows: [], skipped: 0, errors }
  }
  const hasHeader = headerIndex >= 0
  const headerRow = hasHeader ? table[headerIndex]!.map((c) => normalizeHeader(c)) : []
  const format: CsvFormat =
    headerRow.includes('type') && headerRow.includes('content') && !headerRow.some((h) => HEADER_ALIASES[h] === 'title')
      ? 'todoist'
      : headerRow.includes('folder_name') && headerRow.includes('list_name')
        ? 'ticktick'
        : 'plain'
  const defaultCols: Column[] = ['title', 'dueDate', 'listName', 'completed', 'tags']
  const colMap: (Column | null)[] = hasHeader
    ? headerRow.map((h) => {
        const col = HEADER_ALIASES[h] ?? null
        if (format === 'todoist' && h === 'content') return 'title'
        return col
      })
    : defaultCols.map((k, i) => (i < table[0]!.length ? k : null))
  const fileList = format === 'todoist' ? projectNameFromFile(options.fileName) : null

  const dataRows = hasHeader ? table.slice(headerIndex + 1) : table
  const rows: CsvTaskDraft[] = []
  let skipped = 0

  for (const cells of dataRows) {
    const cell = (key: Column) => {
      const i = colMap.indexOf(key)
      return i < 0 ? '' : (cells[i] ?? '').trim()
    }
    // Todoist の section・note の行・区切りの空行は To-Do にしない（数えもしない）
    if (format === 'todoist' && cell('rowType').toLowerCase() !== 'task') continue
    const zone = cell('timeZone')
    const allDay = cell('allDay').toLowerCase()
    const ctx: DateContext = {
      noOffsetIsUtc: format === 'ticktick',
      rowZone: zone && isValidTimeZone(zone) ? zone : null,
      allDay: allDay === 'true' ? true : allDay === 'false' ? false : null,
    }
    const draft: CsvTaskDraft = {
      title: '',
      dueDate: null,
      dueTime: null,
      listName: fileList,
      completed: false,
      completedAt: null,
      priority: 'none',
      tags: [],
      description: '',
    }
    colMap.forEach((key, i) => {
      if (!key || key === 'ignore') return
      const val = (cells[i] ?? '').trim()
      if (key === 'title') draft.title = val
      else if (key === 'dueDate') {
        const due = parseDue(val, ctx)
        draft.dueDate = due?.date ?? null
        draft.dueTime = due?.time ?? null
      } else if (key === 'listName') draft.listName = val || null
      else if (key === 'completed') draft.completed = parseCompleted(val, format)
      else if (key === 'completedAt') draft.completedAt = parseInstant(val, format === 'ticktick')
      else if (key === 'priority') draft.priority = parsePriority(val, format)
      else if (key === 'tags') draft.tags = parseTags(val)
      else if (key === 'description') draft.description = val
    })
    // Todoist: 日付が無ければ締切（DEADLINE）
    if (!draft.dueDate) {
      const deadline = parseDue(cell('deadline'), ctx)
      if (deadline) {
        draft.dueDate = deadline.date
        draft.dueTime = deadline.time
      }
    }
    if (format === 'todoist') {
      const split = splitTodoistLabels(draft.title)
      draft.title = split.title
      draft.tags = [...draft.tags, ...split.labels]
    }
    if (!draft.completed) draft.completedAt = null
    if (!draft.title.trim()) {
      skipped++
      continue
    }
    rows.push({ ...draft, title: draft.title.trim() })
  }

  return { rows, skipped, errors }
}

/** 受信箱にあたるリスト名（TickTick・Todoist の Inbox）。ラベルにしない */
const INBOX_NAMES = new Set(['inbox', '受信箱', 'インボックス'])

export type CsvListTarget =
  { kind: 'inbox' } | { kind: 'list'; id: string } | { kind: 'label'; name: string } | { kind: 'unknown'; name: string }

/** 行のリスト名の行き先: 空・Inbox は To-Do、同じ名前のリスト、同じ名前のラベル（大文字小文字は問わない）、どれでもなければ unknown */
export function csvListTarget(
  rawName: string | null,
  lists: readonly { id: string; name: string }[],
  labelNames: readonly string[],
): CsvListTarget {
  const name = rawName?.trim() ?? ''
  if (!name || INBOX_NAMES.has(name.toLowerCase())) return { kind: 'inbox' }
  const key = name.toLowerCase()
  const list = lists.find((l) => l.name.trim().toLowerCase() === key)
  if (list) return { kind: 'list', id: list.id }
  const label = labelNames.find((l) => l.trim().toLowerCase() === key)
  if (label) return { kind: 'label', name: label }
  return { kind: 'unknown', name }
}

/** 一致するリスト・ラベルの無いリスト名と、その行の数（取り込む前に「ラベルを作るか」を聞くため） */
export function unknownCsvListNames(
  rows: readonly CsvTaskDraft[],
  lists: readonly { id: string; name: string }[],
  labelNames: readonly string[],
): { names: string[]; count: number } {
  const names: string[] = []
  let count = 0
  for (const row of rows) {
    const target = csvListTarget(row.listName, lists, labelNames)
    if (target.kind !== 'unknown') continue
    count++
    if (!names.some((n) => n.toLowerCase() === target.name.toLowerCase())) names.push(target.name)
  }
  return { names, count }
}
