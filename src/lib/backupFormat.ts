import { taskKindFlags, taskKindFromFlags, type Task, type TaskKind, type Priority, type Recurrence } from '../types/task'
import { normalizeListKind, type TaskList } from '../types/list'
import type { ListSection } from '../types/section'
import { inferHabitTimeMode, readHabitFrequency, readHabitTimeOverrides, type Habit } from '../types/habit'
import type { TaskReminder } from '../../supabase/functions/daily-reminders/schedule.ts'
import { normalizeTimeLogTagPresetList } from './timeLogTags'
import { INBOX_COLOR } from '../store/storeConstants'
import { buildRecurrence } from './recurrence'
import { readEstimateMinutes } from './estimate'

/** Web / モバイル共通の JSON バックアップ版。エクスポートは常にこの版。 */
export const BACKUP_SCHEMA_VERSION = 3

/**
 * 取り込むファイル（JSON バックアップ・CSV）の大きさの上限。読む前に確かめる（大きなファイルを丸ごと読んで固まらない）。
 * データは localStorage（数 MB まで）に置くので、書き出したバックアップがこれを超えることはない
 */
export const MAX_IMPORT_FILE_BYTES = 20 * 1024 * 1024

/** 読む前に大きさを確かめる。上限を超えたら true */
export function isImportFileTooLarge(file: Pick<Blob, 'size'>): boolean {
  return file.size > MAX_IMPORT_FILE_BYTES
}

export interface BackupExportInput {
  tasks: Task[]
  lists: TaskList[]
  habits: Habit[]
  sections: ListSection[]
  timeLogTagPresets: string[]
  logCategoryColors: Record<string, string>
}

export interface BackupImportResult {
  tasks: Task[]
  lists: TaskList[]
  habits: Habit[]
  sections: ListSection[]
  timeLogTagPresets: string[] | null
  /** 旧バックアップには無い */
  logCategoryColors: Record<string, string> | null
}

/** 取り込めない理由。画面側で文言にする（`backupProblemText`） */
export type BackupItemKind = 'task' | 'list' | 'section'

export type BackupProblem =
  /** JSON として読めない */
  | { kind: 'notJson' }
  /** tasks / lists が無い（このアプリのバックアップではない） */
  | { kind: 'notBackup' }
  /** このアプリより新しい版で書き出されたもの */
  | { kind: 'newerVersion'; version: number }
  /** ID・タイトル（名前）・リストなど、必須の項目が欠けた行がある */
  | { kind: 'missingFields'; item: 'task' | 'list'; count: number }
  /** 同じ ID が 2 回以上出てくる */
  | { kind: 'duplicateIds'; item: BackupItemKind; count: number; example: string }
  /** ファイルに無いリストを指すタスク・セクションがある */
  | { kind: 'missingList'; item: 'task' | 'section'; count: number; example: string }
  /** ファイルに無いか、別のリストのセクションを指すタスクがある */
  | { kind: 'missingSection'; count: number; example: string }
  /** ファイルに無い親タスクを指すサブタスクがある */
  | { kind: 'missingParent'; count: number; example: string }

export type BackupReadResult = { ok: true; data: BackupImportResult } | { ok: false; problem: BackupProblem }

/** 例として画面に出す名前。空なら ID */
function exampleName(name: string, id: string): string {
  return name.trim() || id
}

/** 重複している ID の件数（2 回目以降の行の数）と、最初の 1 件の名前 */
function findDuplicateIds<T extends { id: string }>(rows: T[], nameOf: (row: T) => string): { count: number; example: string } | null {
  const seen = new Set<string>()
  let count = 0
  let example = ''
  for (const row of rows) {
    if (seen.has(row.id)) {
      if (count === 0) example = exampleName(nameOf(row), row.id)
      count += 1
    }
    seen.add(row.id)
  }
  return count > 0 ? { count, example } : null
}

/** 条件に合わない行の件数と、最初の 1 件の名前 */
function findBad<T extends { id: string }>(
  rows: T[],
  isBad: (row: T) => boolean,
  nameOf: (row: T) => string,
): { count: number; example: string } | null {
  const bad = rows.filter(isBad)
  if (bad.length === 0) return null
  return { count: bad.length, example: exampleName(nameOf(bad[0]), bad[0].id) }
}

function readOrder(raw: Record<string, unknown>): number {
  const v = raw.order ?? raw.sortOrder ?? raw.sort_order
  if (typeof v === 'number' && !Number.isNaN(v)) return v
  if (typeof v === 'string') {
    const n = parseInt(v, 10)
    if (!Number.isNaN(n)) return n
  }
  return 0
}

function readString(raw: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = raw[key]
    if (typeof v === 'string' && v.length > 0) return v
  }
  return null
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/

/** 日付（yyyy-MM-dd）として読めるものだけ */
function readDate(...values: unknown[]): string | null {
  for (const v of values) if (typeof v === 'string' && DATE_RE.test(v)) return v
  return null
}

/** 時刻（HH:mm）として読めるものだけ */
function readTime(...values: unknown[]): string | null {
  for (const v of values) if (typeof v === 'string' && TIME_RE.test(v)) return v
  return null
}

/** ISO 時刻として読めるもの。読めなければ fallback（いま） */
function readStamp(fallback: string, ...values: unknown[]): string {
  for (const v of values) if (typeof v === 'string' && Number.isFinite(Date.parse(v))) return v
  return fallback
}

function readStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

function readRecurrence(v: unknown): Recurrence | null {
  if (typeof v !== 'object' || v === null) return null
  const r = v as Record<string, unknown>
  if (r.type !== 'daily' && r.type !== 'weekly' && r.type !== 'monthly' && r.type !== 'yearly') return null
  const interval = typeof r.interval === 'number' && Number.isInteger(r.interval) && r.interval > 0 ? r.interval : 1
  return buildRecurrence(r.type, interval, r.weekdays, r.monthDay)
}

/** 通知は「いつ基準か」と「何分前か」だけ。壊れた要素は捨てる。配列でなければ既定（null） */
function readReminders(v: unknown): TaskReminder[] | null {
  if (!Array.isArray(v)) return null
  return v.flatMap((r): TaskReminder[] => {
    if (typeof r !== 'object' || r === null) return []
    const { at, minutes } = r as Record<string, unknown>
    if ((at !== 'start' && at !== 'due' && at !== 'dueDay') || typeof minutes !== 'number' || !Number.isFinite(minutes)) return []
    return [{ at, minutes }]
  })
}

function normalizePriority(raw: unknown): Priority {
  if (raw === 'none' || raw === 'low' || raw === 'medium' || raw === 'high') return raw
  return 'medium'
}

export function normalizeTaskRow(raw: unknown): Task | null {
  if (typeof raw !== 'object' || raw === null) return null
  const row = raw as Record<string, unknown>
  const id = readString(row, 'id')
  const title = typeof row.title === 'string' ? row.title : null
  const listId = readString(row, 'listId', 'list_id')
  if (!id || title === null || !listId) return null

  const now = new Date().toISOString()
  const updatedAtRaw = row.updatedAt ?? row.updated_at
  const completedAtRaw = row.completedAt ?? row.completed_at
  let completedAt: string | null = null
  if (typeof completedAtRaw === 'string') {
    completedAt = completedAtRaw
  } else if (row.completed === true && typeof updatedAtRaw === 'string') {
    completedAt = updatedAtRaw
  }

  const order = readOrder(row)
  const sectionRaw = row.sectionId ?? row.section_id
  const parentRaw = row.parentId ?? row.parent_id
  const dueTimeRaw = row.dueTime ?? row.due_time
  const scheduledDateRaw = row.scheduledDate ?? row.scheduled_date
  const archivedAtRaw = row.archivedAt ?? row.archived_at
  const deletedAtRaw = row.deletedAt ?? row.deleted_at
  const habitIdRaw = row.habitId ?? row.habit_id
  const isSleepRaw = row.isSleep ?? row.is_sleep
  const isEventRaw = row.isEvent ?? row.is_event
  const kind: TaskKind =
    row.kind === 'todo' || row.kind === 'event' || row.kind === 'log' || row.kind === 'sleep'
      ? row.kind
      : taskKindFromFlags(
          row.isTimeLog === true || row.is_time_log === true || row.is_time_log === 'true',
          isSleepRaw === true,
          isEventRaw === true,
        )

  // 手で直したファイルや古い形でも、画面が前提にしている形にそろえる。
  // 以前は欠けた `tags` などをそのまま入れ、読み込むたびに画面が落ちていた（保存されるので再読み込みでも直らない）。
  // 知っている項目だけを取り出す（知らない項目をストアに残さない。前の版の印 isTimeLog / isSleep も kind にして捨てる）
  const createdAt = readStamp(now, row.createdAt, row.created_at)
  return {
    id,
    title,
    listId,
    order,
    description: typeof row.description === 'string' ? row.description : '',
    completed: row.completed === true,
    createdAt,
    updatedAt: readStamp(createdAt, row.updatedAt, row.updated_at),
    dueDate: readDate(row.dueDate, row.due_date),
    endDate: readDate(row.endDate, row.end_date),
    startTime: readTime(row.startTime, row.start_time),
    endTime: readTime(row.endTime, row.end_time),
    tags: readStringArray(row.tags),
    category: typeof row.category === 'string' ? row.category : null,
    recurrence: readRecurrence(row.recurrence),
    reminders: readReminders(row.reminders),
    color: typeof row.color === 'string' ? row.color : null,
    location: typeof row.location === 'string' ? row.location : null,
    estimateMinutes: readEstimateMinutes(row.estimateMinutes ?? row.estimate_minutes),
    timeZone: typeof row.timeZone === 'string' ? row.timeZone : null,
    timeZoneAnchor: typeof row.timeZoneAnchor === 'string' ? row.timeZoneAnchor : null,
    sectionId: typeof sectionRaw === 'string' ? sectionRaw : null,
    parentId: typeof parentRaw === 'string' ? parentRaw : null,
    dueTime: readTime(dueTimeRaw),
    scheduledDate: readDate(scheduledDateRaw),
    priority: normalizePriority(row.priority),
    kind,
    habitId: typeof habitIdRaw === 'string' ? habitIdRaw : null,
    sourceTaskId:
      typeof (row.sourceTaskId ?? row.source_task_id) === 'string' ? ((row.sourceTaskId ?? row.source_task_id) as string) : null,
    completedAt,
    archivedAt: typeof archivedAtRaw === 'string' ? archivedAtRaw : null,
    deletedAt: typeof deletedAtRaw === 'string' ? deletedAtRaw : null,
  }
}

export function normalizeListRow(raw: unknown): TaskList | null {
  if (typeof raw !== 'object' || raw === null) return null
  const row = raw as Record<string, unknown>
  const id = readString(row, 'id')
  const name = typeof row.name === 'string' ? row.name : null
  if (!id || name === null) return null
  return {
    id,
    name,
    // 色の無いリスト・習慣は「未分類」と同じラベンダー（Google の 11 色のひとつ）
    color: typeof row.color === 'string' ? row.color : INBOX_COLOR,
    order: readOrder(row),
    kind: normalizeListKind(row.kind),
    // 同期でどちらの端末の変更を残すかに使う（保存データの読み込みでも通るので落とさない）
    ...(typeof row.updatedAt === 'string' ? { updatedAt: row.updatedAt } : {}),
  }
}

export function normalizeSectionRow(raw: unknown): ListSection | null {
  if (typeof raw !== 'object' || raw === null) return null
  const row = raw as Record<string, unknown>
  const id = readString(row, 'id')
  const listId = readString(row, 'listId', 'list_id')
  const name = typeof row.name === 'string' ? row.name : null
  if (!id || !listId || name === null) return null
  return {
    id,
    listId,
    name,
    order: readOrder(row),
    ...(typeof row.updatedAt === 'string' ? { updatedAt: row.updatedAt } : {}),
  }
}

export function normalizeHabitRow(raw: unknown): Habit | null {
  if (typeof raw !== 'object' || raw === null) return null
  const rec = raw as Record<string, unknown>
  const id = rec.id
  const title = rec.title
  if (typeof id !== 'string' || !id || typeof title !== 'string') return null
  const now = new Date().toISOString()
  const startTime = typeof rec.startTime === 'string' ? rec.startTime : null
  const endTime = typeof rec.endTime === 'string' ? rec.endTime : null
  const timeMode =
    rec.timeMode === 'none' || rec.timeMode === 'fixed' || rec.timeMode === 'range' ? rec.timeMode : inferHabitTimeMode(startTime, endTime)
  const timeOverrides = readHabitTimeOverrides(rec.timeOverrides)
  // 知っている項目だけを取り出す（知らない項目をストアに残さない）
  return {
    id,
    title,
    color: typeof rec.color === 'string' ? rec.color : INBOX_COLOR,
    frequency: readHabitFrequency(rec.frequency),
    createdAt: readStamp(now, rec.createdAt),
    updatedAt: readStamp(now, rec.updatedAt),
    completedDates: readStringArray(rec.completedDates).filter((d) => DATE_RE.test(d)),
    timeMode,
    startTime: readTime(startTime),
    endTime: readTime(endTime),
    // 古いバックアップには無い（使用中）
    archivedAt: typeof rec.archivedAt === 'string' && !Number.isNaN(Date.parse(rec.archivedAt)) ? rec.archivedAt : null,
    // 古いバックアップ・1 日も無い習慣には無い
    ...(timeOverrides ? { timeOverrides } : {}),
  }
}

function readSectionsArray(data: Record<string, unknown>): unknown[] {
  const raw = data.listSections ?? data.list_sections ?? data.sections
  return Array.isArray(raw) ? raw : []
}

export function buildBackupPayload(input: BackupExportInput): Record<string, unknown> {
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    // 前の版のアプリは種類を印（記録か・睡眠か・予定か）で読む。そのアプリでも取り込めるように両方書く
    tasks: input.tasks.map((t) => ({ ...t, ...taskKindFlags(t.kind) })),
    lists: input.lists,
    habits: input.habits,
    listSections: input.sections,
    timeLogTagPresets: input.timeLogTagPresets,
    logCategoryColors: input.logCategoryColors,
  }
}

/** 取り込めるか確かめて読む。取り込めないときは理由を返す */
export function readBackupJson(json: string): BackupReadResult {
  let data: Record<string, unknown>
  try {
    data = JSON.parse(json) as Record<string, unknown>
  } catch {
    return { ok: false, problem: { kind: 'notJson' } }
  }
  if (typeof data !== 'object' || data === null || !Array.isArray(data.tasks) || !Array.isArray(data.lists)) {
    return { ok: false, problem: { kind: 'notBackup' } }
  }
  const version = data.schemaVersion
  if (typeof version === 'number' && version > BACKUP_SCHEMA_VERSION) {
    return { ok: false, problem: { kind: 'newerVersion', version } }
  }

  const tasks = (data.tasks as unknown[]).map(normalizeTaskRow).filter((t): t is Task => t !== null)
  const lists = (data.lists as unknown[]).map(normalizeListRow).filter((l): l is TaskList => l !== null)

  if (lists.length !== data.lists.length) {
    return { ok: false, problem: { kind: 'missingFields', item: 'list', count: data.lists.length - lists.length } }
  }
  if (tasks.length !== data.tasks.length) {
    return { ok: false, problem: { kind: 'missingFields', item: 'task', count: data.tasks.length - tasks.length } }
  }

  const sections = readSectionsArray(data)
    .map(normalizeSectionRow)
    .filter((s): s is ListSection => s !== null)

  const habits = Array.isArray(data.habits) ? (data.habits as unknown[]).map(normalizeHabitRow).filter((h): h is Habit => h !== null) : []

  const rawPresets = data.timeLogTagPresets
  const timeLogTagPresets = Array.isArray(rawPresets)
    ? normalizeTimeLogTagPresetList(rawPresets.filter((x): x is string => typeof x === 'string'))
    : null

  const rawColors = data.logCategoryColors
  const logCategoryColors =
    rawColors && typeof rawColors === 'object' && !Array.isArray(rawColors)
      ? Object.fromEntries(
          Object.entries(rawColors as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string'),
        )
      : null

  // 形は合っていても、中身の食い違うものは取り込まない（どこが悪いかを返す）
  const duplicateLists = findDuplicateIds(lists, (l) => l.name)
  if (duplicateLists) return { ok: false, problem: { kind: 'duplicateIds', item: 'list', ...duplicateLists } }
  const duplicateSections = findDuplicateIds(sections, (s) => s.name)
  if (duplicateSections) return { ok: false, problem: { kind: 'duplicateIds', item: 'section', ...duplicateSections } }
  const duplicateTasks = findDuplicateIds(tasks, (t) => t.title)
  if (duplicateTasks) return { ok: false, problem: { kind: 'duplicateIds', item: 'task', ...duplicateTasks } }

  const listIds = new Set(lists.map((l) => l.id))
  const sectionById = new Map(sections.map((s) => [s.id, s]))
  const taskIds = new Set(tasks.map((t) => t.id))

  const sectionsWithoutList = findBad(
    sections,
    (s) => !listIds.has(s.listId),
    (s) => s.name,
  )
  if (sectionsWithoutList) return { ok: false, problem: { kind: 'missingList', item: 'section', ...sectionsWithoutList } }
  const tasksWithoutList = findBad(
    tasks,
    (t) => !listIds.has(t.listId),
    (t) => t.title,
  )
  if (tasksWithoutList) return { ok: false, problem: { kind: 'missingList', item: 'task', ...tasksWithoutList } }
  const tasksWithBadSection = findBad(
    tasks,
    (t) => Boolean(t.sectionId) && sectionById.get(t.sectionId!)?.listId !== t.listId,
    (t) => t.title,
  )
  if (tasksWithBadSection) return { ok: false, problem: { kind: 'missingSection', ...tasksWithBadSection } }
  const tasksWithoutParent = findBad(
    tasks,
    (t) => Boolean(t.parentId) && !taskIds.has(t.parentId!),
    (t) => t.title,
  )
  if (tasksWithoutParent) return { ok: false, problem: { kind: 'missingParent', ...tasksWithoutParent } }

  return {
    ok: true,
    data: {
      tasks,
      lists,
      habits,
      sections,
      timeLogTagPresets,
      logCategoryColors,
    },
  }
}

/** 取り込めるものだけを返す（理由がいらないとき用）。取り込めなければ null */
export function parseBackupJson(json: string): BackupImportResult | null {
  const read = readBackupJson(json)
  return read.ok ? read.data : null
}

export type BackupPreview = { ok: true; tasks: number; lists: number } | { ok: false; problem: BackupProblem }

/**
 * 取り込み前の下見。件数だけを返す。
 * 取り込みは現在のデータを全て置き換えるので、「何件が何件になるか」を
 * 確認ダイアログに出せるようにする。取り込めないファイルなら、その理由を返す。
 */
export function previewBackupJson(json: string): BackupPreview {
  const read = readBackupJson(json)
  if (!read.ok) return read
  return { ok: true, tasks: read.data.tasks.length, lists: read.data.lists.length }
}

/**
 * 全置換の取り込み・取り込みの取り消しで使う。ファイルの古い updatedAt のままだと、同期で
 * サーバーにある新しい行のほうが勝ち、取り込んだ内容と元の内容が混ざっていた
 */
export function withFreshStamps(result: BackupImportResult): BackupImportResult {
  const updatedAt = new Date().toISOString()
  return {
    ...result,
    tasks: result.tasks.map((t) => ({ ...t, updatedAt })),
    lists: result.lists.map((l) => ({ ...l, updatedAt })),
    sections: result.sections.map((s) => ({ ...s, updatedAt })),
    habits: result.habits.map((h) => ({ ...h, updatedAt })),
  }
}

const ROW_NORMALIZERS = {
  tasks: normalizeTaskRow,
  lists: normalizeListRow,
  sections: normalizeSectionRow,
  habits: normalizeHabitRow,
} as const
type RowKind = keyof typeof ROW_NORMALIZERS
type RowOf<K extends RowKind> = NonNullable<ReturnType<(typeof ROW_NORMALIZERS)[K]>>

/**
 * 保存データ・他のタブの書き込みの一覧を、バックアップの取り込みと同じ基準で行ごとにそろえる。
 * 型の違う項目は直し、読めない行（id・題名が無いなど）は外す。`broken` は配列でない・外した行があったとき
 * （元の中身を別のキーに写す合図）。配列でなければ `rows` は null
 */
export function normalizeStoredRows<K extends RowKind>(kind: K, value: unknown): { rows: RowOf<K>[] | null; broken: boolean } {
  if (!Array.isArray(value)) return { rows: null, broken: value !== undefined }
  const normalize = ROW_NORMALIZERS[kind] as (raw: unknown) => RowOf<K> | null
  const rows = value.map(normalize).filter((r): r is RowOf<K> => r !== null)
  return { rows, broken: rows.length !== value.length }
}
