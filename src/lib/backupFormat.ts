import type { Task, Priority, Recurrence } from '../types/task'
import { normalizeListKind, type TaskList } from '../types/list'
import type { ListSection } from '../types/section'
import { inferHabitTimeMode, type Habit } from '../types/habit'
import {
  normalizeListColorPaletteId,
  type ListColorPaletteId,
} from './listColorPalettes'
import { normalizeTimeLogTagPresetList } from './tagColors'

/** Web / モバイル共通の JSON バックアップ版。エクスポートは常にこの版。 */
export const BACKUP_SCHEMA_VERSION = 3

export interface BackupExportInput {
  tasks: Task[]
  lists: TaskList[]
  habits: Habit[]
  sections: ListSection[]
  listColorPaletteId: ListColorPaletteId
  timeLogTagPresets: string[]
  logCategoryColors: Record<string, string>
}

export interface BackupImportResult {
  tasks: Task[]
  lists: TaskList[]
  habits: Habit[]
  sections: ListSection[]
  listColorPaletteId: ListColorPaletteId | null
  timeLogTagPresets: string[] | null
  /** 旧バックアップには無い */
  logCategoryColors: Record<string, string> | null
}

function hasDuplicateIds<T extends { id: string }>(rows: T[]): boolean {
  const seen = new Set<string>()
  for (const row of rows) {
    if (seen.has(row.id)) return true
    seen.add(row.id)
  }
  return false
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
  return { type: r.type, interval }
}

function normalizePriority(raw: unknown): Priority {
  if (raw === 'none' || raw === 'low' || raw === 'medium' || raw === 'high') return raw
  return 'medium'
}

function normalizeTaskRow(raw: unknown): Task | null {
  if (typeof raw !== 'object' || raw === null) return null
  const row = raw as Record<string, unknown>
  const id = readString(row, 'id')
  const title = typeof row.title === 'string' ? row.title : null
  const listId = readString(row, 'listId', 'list_id')
  if (!id || title === null || !listId) return null

  const t = raw as Task
  const now = new Date().toISOString()
  const isTimeLog =
    t.isTimeLog === true || row.is_time_log === true || row.is_time_log === 'true'
  const completedAtRaw = row.completedAt ?? row.completed_at
  let completedAt: string | null = null
  if (typeof completedAtRaw === 'string') {
    completedAt = completedAtRaw
  } else if (t.completed === true && typeof t.updatedAt === 'string') {
    completedAt = t.updatedAt
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

  // 手で直したファイルや古い形でも、画面が前提にしている形にそろえる。
  // 以前は欠けた `tags` などをそのまま入れ、読み込むたびに画面が落ちていた（保存されるので再読み込みでも直らない）
  const createdAt = readStamp(now, row.createdAt, row.created_at)
  return {
    ...t,
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
    recurrence: readRecurrence(row.recurrence),
    reminders: Array.isArray(row.reminders) ? (row.reminders as Task['reminders']) : null,
    color: typeof row.color === 'string' ? row.color : null,
    location: typeof row.location === 'string' ? row.location : null,
    timeZone: typeof row.timeZone === 'string' ? row.timeZone : null,
    timeZoneAnchor: typeof row.timeZoneAnchor === 'string' ? row.timeZoneAnchor : null,
    sectionId: typeof sectionRaw === 'string' ? sectionRaw : (t.sectionId ?? null),
    parentId: typeof parentRaw === 'string' ? parentRaw : (t.parentId ?? null),
    dueTime: readTime(dueTimeRaw),
    scheduledDate: readDate(scheduledDateRaw),
    priority: normalizePriority(t.priority ?? row.priority),
    isTimeLog: Boolean(isTimeLog),
    habitId: typeof habitIdRaw === 'string' ? habitIdRaw : null,
    isSleep: isSleepRaw === true,
    completedAt,
    archivedAt: typeof archivedAtRaw === 'string' ? archivedAtRaw : null,
    deletedAt: typeof deletedAtRaw === 'string' ? deletedAtRaw : null,
  }
}

function normalizeListRow(raw: unknown): TaskList | null {
  if (typeof raw !== 'object' || raw === null) return null
  const row = raw as Record<string, unknown>
  const id = readString(row, 'id')
  const name = typeof row.name === 'string' ? row.name : null
  if (!id || name === null) return null
  return {
    id,
    name,
    color: typeof row.color === 'string' ? row.color : '#6366f1',
    order: readOrder(row),
    kind: normalizeListKind(row.kind),
  }
}

function normalizeSectionRow(raw: unknown): ListSection | null {
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
  }
}

function normalizeHabitRow(raw: unknown): Habit | null {
  if (typeof raw !== 'object' || raw === null) return null
  const rec = raw as Record<string, unknown>
  const h = raw as Habit
  if (typeof h.id !== 'string' || !h.id || typeof h.title !== 'string') return null
  const now = new Date().toISOString()
  const startTime = typeof h.startTime === 'string' ? h.startTime : null
  const endTime = typeof h.endTime === 'string' ? h.endTime : null
  const timeMode =
    h.timeMode === 'none' || h.timeMode === 'fixed' || h.timeMode === 'range'
      ? h.timeMode
      : inferHabitTimeMode(startTime, endTime)
  const weekdays = h.frequency?.type === 'weekly' && Array.isArray(h.frequency.weekdays)
    ? h.frequency.weekdays.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7)
    : null
  return {
    ...h,
    ...rec,
    color: typeof h.color === 'string' ? h.color : '#6366f1',
    frequency: weekdays ? { type: 'weekly', weekdays } : { type: 'daily' },
    createdAt: readStamp(now, h.createdAt),
    updatedAt: readStamp(now, h.updatedAt),
    completedDates: readStringArray(h.completedDates).filter((d) => DATE_RE.test(d)),
    timeMode,
    startTime: readTime(startTime),
    endTime: readTime(endTime),
  } as Habit
}

function readSectionsArray(data: Record<string, unknown>): unknown[] {
  const raw =
    data.listSections ?? data.list_sections ?? data.sections
  return Array.isArray(raw) ? raw : []
}

export function buildBackupPayload(input: BackupExportInput): Record<string, unknown> {
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    tasks: input.tasks,
    lists: input.lists,
    habits: input.habits,
    listSections: input.sections,
    listColorPaletteId: input.listColorPaletteId,
    timeLogTagPresets: input.timeLogTagPresets,
    logCategoryColors: input.logCategoryColors,
  }
}

export function parseBackupJson(json: string): BackupImportResult | null {
  try {
    const data = JSON.parse(json) as Record<string, unknown>
    if (!Array.isArray(data.tasks) || !Array.isArray(data.lists)) return null

    const tasks = (data.tasks as unknown[])
      .map(normalizeTaskRow)
      .filter((t): t is Task => t !== null)
    const lists = (data.lists as unknown[])
      .map(normalizeListRow)
      .filter((l): l is TaskList => l !== null)

    if (tasks.length !== data.tasks.length || lists.length !== data.lists.length) return null

    const sections = readSectionsArray(data)
      .map(normalizeSectionRow)
      .filter((s): s is ListSection => s !== null)

    const habits = Array.isArray(data.habits)
      ? (data.habits as unknown[])
          .map(normalizeHabitRow)
          .filter((h): h is Habit => h !== null)
      : []

    const paletteRaw = data.listColorPaletteId
    const listColorPaletteId =
      paletteRaw !== undefined && paletteRaw !== null
        ? normalizeListColorPaletteId(paletteRaw)
        : null

    const rawPresets = data.timeLogTagPresets
    const timeLogTagPresets = Array.isArray(rawPresets)
      ? normalizeTimeLogTagPresetList(rawPresets.filter((x): x is string => typeof x === 'string'))
      : null

    const rawColors = data.logCategoryColors
    const logCategoryColors =
      rawColors && typeof rawColors === 'object' && !Array.isArray(rawColors)
        ? Object.fromEntries(
            Object.entries(rawColors as Record<string, unknown>).filter(
              (e): e is [string, string] => typeof e[1] === 'string',
            ),
          )
        : null

    // Validation: reject structurally valid but inconsistent backups.
    if (hasDuplicateIds(tasks) || hasDuplicateIds(lists) || hasDuplicateIds(sections)) return null

    const listIds = new Set(lists.map((l) => l.id))
    const sectionById = new Map(sections.map((s) => [s.id, s]))
    const taskIds = new Set(tasks.map((t) => t.id))
    for (const section of sections) {
      if (!listIds.has(section.listId)) return null
    }
    for (const task of tasks) {
      if (!listIds.has(task.listId)) return null
      if (task.sectionId && !sectionById.has(task.sectionId)) return null
      if (task.sectionId) {
        const sec = sectionById.get(task.sectionId)
        if (!sec || sec.listId !== task.listId) return null
      }
      if (task.parentId && !taskIds.has(task.parentId)) return null
    }

    return {
      tasks,
      lists,
      habits,
      sections,
      listColorPaletteId,
      timeLogTagPresets,
      logCategoryColors,
    }
  } catch {
    return null
  }
}

/**
 * 取り込み前の下見。件数だけを返す。
 * 取り込みは現在のデータを全て置き換えるので、「何件が何件になるか」を
 * 確認ダイアログに出せるようにする。壊れたファイルなら null（= 取り込めない）。
 */
export function previewBackupJson(json: string): { tasks: number; lists: number } | null {
  const parsed = parseBackupJson(json)
  if (!parsed) return null
  return { tasks: parsed.tasks.length, lists: parsed.lists.length }
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
