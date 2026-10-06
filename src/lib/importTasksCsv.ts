import type { Priority } from '../types/task'

export interface CsvTaskDraft {
  title: string
  dueDate: string | null
  listName: string | null
  completed: boolean
  priority: Priority
  tags: string[]
  description: string
}

export interface CsvParseResult {
  rows: CsvTaskDraft[]
  skipped: number
  errors: string[]
}

const HEADER_ALIASES: Record<string, keyof CsvTaskDraft | 'ignore'> = {
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
  締切: 'dueDate',
  期日: 'dueDate',
  list: 'listName',
  list_name: 'listName',
  project: 'listName',
  リスト: 'listName',
  completed: 'completed',
  done: 'completed',
  status: 'completed',
  完了: 'completed',
  priority: 'priority',
  優先度: 'priority',
  tags: 'tags',
  tag: 'tags',
  labels: 'tags',
  タグ: 'tags',
  notes: 'description',
  note: 'description',
  description: 'description',
  memo: 'description',
  メモ: 'description',
  説明: 'description',
}

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

function parsePriority(raw: string): Priority {
  const v = raw.trim().toLowerCase()
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

function normalizeDate(raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  const slash = v.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
  if (slash) {
    const [, y, m, d] = slash
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const parsed = new Date(v)
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear()
    const m = String(parsed.getMonth() + 1).padStart(2, '0')
    const d = String(parsed.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return null
}

export function parseTasksCsv(text: string): CsvParseResult {
  const table = parseCsvRows(text)
  const errors: string[] = []
  if (table.length === 0) {
    return { rows: [], skipped: 0, errors: ['empty'] }
  }

  const headerRow = table[0].map((c) => normalizeHeader(c))
  const hasHeader = headerRow.some((h) => HEADER_ALIASES[h] !== undefined)
  const defaultCols: (keyof CsvTaskDraft)[] = ['title', 'dueDate', 'listName', 'completed', 'tags']
  const colMap: (keyof CsvTaskDraft | 'ignore' | null)[] = hasHeader
    ? headerRow.map((h) => HEADER_ALIASES[h] ?? null)
    : defaultCols.map((k, i) => (i < table[0].length ? k : null))

  if (hasHeader && !colMap.includes('title')) {
    errors.push('missing_title_column')
    return { rows: [], skipped: 0, errors }
  }

  const dataRows = hasHeader ? table.slice(1) : table
  const rows: CsvTaskDraft[] = []
  let skipped = 0

  for (const cells of dataRows) {
    const draft: CsvTaskDraft = {
      title: '',
      dueDate: null,
      listName: null,
      completed: false,
      priority: 'none',
      tags: [],
      description: '',
    }
    colMap.forEach((key, i) => {
      if (!key || key === 'ignore') return
      const val = (cells[i] ?? '').trim()
      if (key === 'title') draft.title = val
      else if (key === 'dueDate') draft.dueDate = normalizeDate(val)
      else if (key === 'listName') draft.listName = val || null
      else if (key === 'completed') draft.completed = parseBool(val)
      else if (key === 'priority') draft.priority = parsePriority(val)
      else if (key === 'tags') draft.tags = parseTags(val)
      else if (key === 'description') draft.description = val
    })
    if (!draft.title.trim()) {
      skipped++
      continue
    }
    rows.push({ ...draft, title: draft.title.trim() })
  }

  return { rows, skipped, errors }
}
