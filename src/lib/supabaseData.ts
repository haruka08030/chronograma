import type { SupabaseClient } from '@supabase/supabase-js'
import type { Task } from '../types/task'
import type { TaskReminder } from '../../supabase/functions/daily-reminders/schedule.ts'
import { normalizeListKind, type TaskList } from '../types/list'
import type { ListSection } from '../types/section'
import { inferHabitTimeMode, type Habit, type HabitWeekday } from '../types/habit'
import { INBOX_LIST_ID } from '../store/taskStore'
import type { SyncDeletes } from './syncMerge'
import { reanchorTask } from './taskTimeZone'
import { withLogCategory } from './taskDefaults'
import type { RemoteLabels } from './labelSync'
import { normalizeExtraTimeZones, type RemoteExtraTimeZones } from './extraTimeZones'
import { buildRecurrence } from './recurrence'

/** 更新時刻を持たない古いリスト・セクション。同期では最古として扱われる（列は not null） */
const UNKNOWN_UPDATED_AT = '1970-01-01T00:00:00.000Z'

interface ListRow {
  id: string
  user_id: string
  name: string
  color: string
  sort_order: number
  /** 古い DB には無い */
  kind?: string | null
  updated_at: string
}

interface HabitRow {
  id: string
  user_id: string
  title: string
  color: string
  time_mode: string | null
  start_time: string | null
  end_time: string | null
  frequency: unknown
  completed_dates: unknown
  created_at: string
  updated_at: string
  /** 古い DB には無い（`003`）。無い・null は使用中 */
  archived_at?: string | null
}

interface TaskRow {
  id: string
  user_id: string
  list_id: string
  parent_id: string | null
  section_id?: string | null
  title: string
  description: string
  completed: boolean
  created_at: string
  updated_at: string
  sort_order: number
  due_date: string | null
  due_time?: string | null
  scheduled_date?: string | null
  end_date?: string | null
  start_time: string | null
  end_time: string | null
  location?: string | null
  /** 古い DB には無い */
  color?: string | null
  /** 古い DB には無い */
  habit_id?: string | null
  /** 古い DB には無い */
  is_sleep?: boolean | null
  /** 古い DB には無い */
  time_zone?: string | null
  time_zone_anchor?: string | null
  /** 古い DB には無い */
  reminders?: unknown
  priority: string
  tags: unknown
  category?: string | null
  recurrence: unknown
  is_time_log: boolean
  completed_at?: string | null
  archived_at?: string | null
  deleted_at?: string | null
}

function isMissingEndDateColumnError(message: string | undefined): boolean {
  if (!message) return false
  return message.includes("Could not find the 'end_date' column")
}

function stripEndDateFromTaskRows(rows: TaskRow[]): TaskRow[] {
  return rows.map(({ end_date, ...rest }) => {
    void end_date
    return rest
  })
}

function isMissingCompletedAtColumnError(message: string | undefined): boolean {
  if (!message) return false
  return message.includes("Could not find the 'completed_at' column")
}

function stripCompletedAtFromTaskRows(rows: TaskRow[]): TaskRow[] {
  return rows.map(({ completed_at, ...rest }) => {
    void completed_at
    return rest
  })
}

function isMissingLocationColumnError(message: string | undefined): boolean {
  if (!message) return false
  return message.includes("Could not find the 'location' column")
}

function stripLocationFromTaskRows(rows: TaskRow[]): TaskRow[] {
  return rows.map(({ location, ...rest }) => {
    void location
    return rest
  })
}

function isMissingColorColumnError(message: string | undefined): boolean {
  if (!message) return false
  return message.includes("Could not find the 'color' column")
}

function stripColorFromTaskRows(rows: TaskRow[]): TaskRow[] {
  return rows.map(({ color, ...rest }) => {
    void color
    return rest
  })
}

function isMissingHabitIdColumnError(message: string | undefined): boolean {
  if (!message) return false
  return message.includes("Could not find the 'habit_id' column")
}

function stripHabitIdFromTaskRows(rows: TaskRow[]): TaskRow[] {
  return rows.map(({ habit_id, ...rest }) => {
    void habit_id
    return rest
  })
}

function isMissingIsSleepColumnError(message: string | undefined): boolean {
  if (!message) return false
  return message.includes("Could not find the 'is_sleep' column")
}

function stripIsSleepFromTaskRows(rows: TaskRow[]): TaskRow[] {
  return rows.map(({ is_sleep, ...rest }) => {
    void is_sleep
    return rest
  })
}

function isMissingTimeZoneColumnError(message: string | undefined): boolean {
  if (!message) return false
  return /Could not find the 'time_zone(_anchor)?' column/.test(message)
}

function stripTimeZoneFromTaskRows(rows: TaskRow[]): TaskRow[] {
  return rows.map(({ time_zone, time_zone_anchor, ...rest }) => {
    void time_zone
    void time_zone_anchor
    return rest
  })
}

function isMissingRemindersColumnError(message: string | undefined): boolean {
  if (!message) return false
  return message.includes("Could not find the 'reminders' column")
}

function stripRemindersFromTaskRows(rows: TaskRow[]): TaskRow[] {
  return rows.map(({ reminders, ...rest }) => {
    void reminders
    return rest
  })
}

function isMissingDueTimeColumnError(message: string | undefined): boolean {
  if (!message) return false
  return message.includes("Could not find the 'due_time' column")
}

function stripDueTimeFromTaskRows(rows: TaskRow[]): TaskRow[] {
  return rows.map(({ due_time, ...rest }) => {
    void due_time
    return rest
  })
}

function isMissingScheduledDateColumnError(message: string | undefined): boolean {
  if (!message) return false
  return message.includes("Could not find the 'scheduled_date' column")
}

function stripScheduledDateFromTaskRows(rows: TaskRow[]): TaskRow[] {
  return rows.map(({ scheduled_date, ...rest }) => {
    void scheduled_date
    return rest
  })
}

function isMissingArchivedAtColumnError(message: string | undefined): boolean {
  if (!message) return false
  return message.includes("Could not find the 'archived_at' column")
}

function stripArchivedAtFromTaskRows(rows: TaskRow[]): TaskRow[] {
  return rows.map(({ archived_at, ...rest }) => {
    void archived_at
    return rest
  })
}

function isMissingDeletedAtColumnError(message: string | undefined): boolean {
  if (!message) return false
  return message.includes("Could not find the 'deleted_at' column")
}

function stripDeletedAtFromTaskRows(rows: TaskRow[]): TaskRow[] {
  return rows.map(({ deleted_at, ...rest }) => {
    void deleted_at
    return rest
  })
}

interface SectionRow {
  id: string
  user_id: string
  list_id: string
  name: string
  sort_order: number
  updated_at: string
}

function rowToSection(row: SectionRow): ListSection {
  return {
    id: row.id,
    listId: row.list_id,
    name: row.name,
    order: row.sort_order,
    updatedAt: row.updated_at,
  }
}

/**
 * DB の大きさの上限（`001_chronograma_schema.sql` の *_size_check）。超えると送るたびに失敗して同期が止まるので、送る前に切る。
 * ふつうの使い方では届かない長さ（貼り付けた巨大な文章などだけ）
 */
const MAX_NAME = 500
const MAX_TITLE = 2000
const MAX_DESCRIPTION = 200_000
const clip = (text: string, max: number) => (text.length > max ? text.slice(0, max) : text)

function sectionToRow(userId: string, sec: ListSection): SectionRow {
  return {
    id: sec.id,
    user_id: userId,
    list_id: sec.listId,
    name: clip(sec.name, MAX_NAME),
    sort_order: sec.order,
    // 送った時刻にすると、手元で変えていない端末の送信が「新しい変更」に見えて他端末の変更を上書きする
    updated_at: sec.updatedAt ?? UNKNOWN_UPDATED_AT,
  }
}

function rowToList(row: ListRow): TaskList {
  const name = row.id === INBOX_LIST_ID && row.name === '受信トレイ' ? '未分類' : row.name
  return {
    id: row.id,
    name,
    color: row.color,
    order: row.sort_order,
    kind: normalizeListKind(row.kind),
    updatedAt: row.updated_at,
  }
}

function rowToHabit(row: HabitRow): Habit {
  const freqRaw = row.frequency
  let frequency: Habit['frequency'] = { type: 'daily' }
  if (freqRaw && typeof freqRaw === 'object' && freqRaw !== null) {
    const f = freqRaw as Record<string, unknown>
    if (f.type === 'daily') frequency = { type: 'daily' }
    else if (f.type === 'weekly' && Array.isArray(f.weekdays)) {
      const wd = f.weekdays.filter((x): x is number => typeof x === 'number') as HabitWeekday[]
      frequency = { type: 'weekly', weekdays: wd }
    }
  }
  const datesRaw = row.completed_dates
  const completedDates = Array.isArray(datesRaw)
    ? datesRaw.filter((d): d is string => typeof d === 'string')
    : []
  const inferredMode = inferHabitTimeMode(row.start_time, row.end_time)
  const timeMode = row.time_mode === 'none' || row.time_mode === 'fixed' || row.time_mode === 'range'
    ? row.time_mode
    : inferredMode
  return {
    id: row.id,
    title: row.title,
    color: row.color,
    timeMode,
    startTime: row.start_time,
    endTime: row.end_time,
    frequency,
    completedDates,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: typeof row.archived_at === 'string' ? row.archived_at : null,
  }
}

function habitToRow(userId: string, h: Habit): HabitRow {
  return {
    id: h.id,
    user_id: userId,
    title: clip(h.title, MAX_TITLE),
    color: h.color,
    time_mode: h.timeMode,
    start_time: h.startTime,
    end_time: h.endTime,
    frequency: h.frequency,
    completed_dates: h.completedDates,
    created_at: h.createdAt,
    updated_at: h.updatedAt,
    archived_at: h.archivedAt ?? null,
  }
}

/** 壊れた要素は捨てる。配列でなければ既定（null） */
export function parseReminders(raw: unknown): TaskReminder[] | null {
  if (!Array.isArray(raw)) return null
  return raw.filter(
    (r): r is TaskReminder =>
      typeof r === 'object' && r !== null &&
      ['start', 'due', 'dueDay'].includes((r as TaskReminder).at) &&
      Number.isFinite((r as TaskReminder).minutes),
  )
}

/** サーバーの行をタスクに（記録の分類は category。前の版の端末が書いた行は tags の先頭から） */
function rowToTask(row: TaskRow): Task {
  return withLogCategory(rowToTaskFields(row))
}

function rowToTaskFields(row: TaskRow): Task {
  const tags = Array.isArray(row.tags) ? row.tags.filter((t): t is string => typeof t === 'string') : []
  let recurrence: Task['recurrence'] = null
  if (row.recurrence && typeof row.recurrence === 'object' && row.recurrence !== null) {
    const r = row.recurrence as Record<string, unknown>
    const type = r.type
    const interval = r.interval
    if (
      (type === 'daily' || type === 'weekly' || type === 'monthly' || type === 'yearly') &&
      typeof interval === 'number'
    ) {
      recurrence = buildRecurrence(type, interval, r.weekdays)
    }
  }
  const priority =
    row.priority === 'low' || row.priority === 'medium' || row.priority === 'high' || row.priority === 'none'
      ? row.priority
      : 'none'
  const completedAt =
    typeof row.completed_at === 'string'
      ? row.completed_at
      : row.completed
        ? row.updated_at
        : null
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    completed: row.completed,
    completedAt,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    order: row.sort_order,
    listId: row.list_id,
    sectionId: row.section_id ?? null,
    parentId: row.parent_id,
    dueDate: row.due_date,
    dueTime: typeof row.due_time === 'string' ? row.due_time : null,
    scheduledDate: typeof row.scheduled_date === 'string' ? row.scheduled_date : null,
    endDate: row.end_date ?? null,
    startTime: row.start_time,
    endTime: row.end_time,
    location: typeof row.location === 'string' ? row.location : null,
    color: typeof row.color === 'string' ? row.color : null,
    priority,
    tags,
    category: typeof row.category === 'string' ? row.category : null,
    recurrence,
    isTimeLog: row.is_time_log === true,
    habitId: typeof row.habit_id === 'string' ? row.habit_id : null,
    isSleep: row.is_sleep === true,
    timeZone: typeof row.time_zone === 'string' && row.time_zone ? row.time_zone : null,
    timeZoneAnchor: typeof row.time_zone_anchor === 'string' && row.time_zone_anchor ? row.time_zone_anchor : null,
    reminders: parseReminders(row.reminders),
    archivedAt: typeof row.archived_at === 'string' ? row.archived_at : null,
    deletedAt: typeof row.deleted_at === 'string' ? row.deleted_at : null,
  }
}

function listToRow(userId: string, list: TaskList): ListRow {
  return {
    id: list.id,
    user_id: userId,
    name: clip(list.name, MAX_NAME),
    color: list.color,
    sort_order: list.order,
    kind: list.kind ?? 'tasks',
    updated_at: list.updatedAt ?? UNKNOWN_UPDATED_AT,
  }
}

function taskToRow(userId: string, task: Task): TaskRow {
  return {
    id: task.id,
    user_id: userId,
    list_id: task.listId,
    parent_id: task.parentId,
    section_id: task.sectionId ?? null,
    title: clip(task.title, MAX_TITLE),
    description: clip(task.description, MAX_DESCRIPTION),
    completed: task.completed,
    completed_at: task.completedAt ?? null,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
    sort_order: task.order,
    due_date: task.dueDate,
    due_time: task.dueTime ?? null,
    scheduled_date: task.scheduledDate ?? null,
    end_date: task.endDate ?? null,
    start_time: task.startTime,
    end_time: task.endTime,
    location: task.location == null ? null : clip(task.location, MAX_TITLE),
    color: task.color ?? null,
    priority: task.priority,
    tags: task.tags,
    category: task.isTimeLog ? task.category : null,
    recurrence: task.recurrence,
    is_time_log: task.isTimeLog ?? false,
    habit_id: task.habitId ?? null,
    is_sleep: task.isSleep ?? false,
    time_zone: task.timeZone ?? null,
    time_zone_anchor: task.timeZoneAnchor ?? null,
    reminders: task.reminders ?? null,
    archived_at: task.archivedAt ?? null,
    deleted_at: task.deletedAt ?? null,
  }
}

/** 1 回の取得の行数。Supabase の API は既定で 1,000 行までしか返さない */
const PAGE_SIZE = 1000

/**
 * 利用者の行を全部取る。1 回で取ると上限（既定 1,000 行）で切れ、返ってこなかった行が
 * 三方向マージで「他端末で消された」扱いになって手元から消えていた。
 * 件数も一緒に受け取り、全部そろうまでページを送る。毎回の push で行の並びが変わるので id 順に固定する
 */
async function fetchAllRows<T>(
  supabase: SupabaseClient,
  table: string,
  userId: string,
): Promise<{ rows: T[] } | { error: string }> {
  const rows: T[] = []
  let total: number | null = null
  do {
    const { data, count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('id')
      .range(rows.length, rows.length + PAGE_SIZE - 1)
    if (error) return { error: error.message }
    const page = (data ?? []) as T[]
    total = count
    // 取得中に行が減ると最後のページが空になる。途中までの結果でマージすると足りない行が
    // 「消された」扱いになるので、次の同期でやり直す
    if (page.length === 0) {
      if (total !== null && rows.length < total) return { error: `${table}: fetched ${rows.length} of ${total} rows` }
      break
    }
    rows.push(...page)
  } while (total !== null && rows.length < total)
  return { rows }
}

export async function fetchListsTasksHabits(
  supabase: SupabaseClient,
  userId: string,
): Promise<
  { lists: TaskList[]; tasks: Task[]; habits: Habit[]; sections: ListSection[] } | { error: string }
> {
  const listRows = await fetchAllRows<ListRow>(supabase, 'lists', userId)
  if ('error' in listRows) return listRows
  const sectionRows = await fetchAllRows<SectionRow>(supabase, 'list_sections', userId)
  if ('error' in sectionRows) return sectionRows
  const taskRows = await fetchAllRows<TaskRow>(supabase, 'tasks', userId)
  if ('error' in taskRows) return taskRows
  const habitRows = await fetchAllRows<HabitRow>(supabase, 'habits', userId)
  if ('error' in habitRows) return habitRows

  return {
    lists: listRows.rows.map(rowToList),
    sections: sectionRows.rows.map(rowToSection),
    tasks: taskRows.rows.map(rowToTask),
    habits: habitRows.rows.map(rowToHabit),
  }
}

/** Remote is only default inbox and no tasks (and no extra lists / habits). */
function isTrivialRemote(
  lists: TaskList[],
  tasks: Task[],
  habits: Habit[],
  sections: ListSection[],
): boolean {
  if (tasks.length > 0 || habits.length > 0 || sections.length > 0) return false
  const nonInbox = lists.filter((l) => l.id !== INBOX_LIST_ID)
  return nonInbox.length === 0
}

export type HydrateDecision =
  | { kind: 'use_remote'; lists: TaskList[]; tasks: Task[]; habits: Habit[]; sections: ListSection[] }
  | { kind: 'push_local' }

/** Decide first sync: upload local-only data vs replace with server snapshot. */
export function decideHydrate(
  remoteLists: TaskList[],
  remoteTasks: Task[],
  remoteHabits: Habit[],
  remoteSections: ListSection[],
  localLists: TaskList[],
  localTasks: Task[],
  localHabits: Habit[],
  localSections: ListSection[],
): HydrateDecision {
  if (remoteLists.length === 0 && remoteTasks.length === 0 && remoteHabits.length === 0 && remoteSections.length === 0) {
    return { kind: 'push_local' }
  }
  if (isTrivialRemote(remoteLists, remoteTasks, remoteHabits, remoteSections)) {
    const localHasData =
      localTasks.length > 0
      || localHabits.length > 0
      || localSections.length > 0
      || localLists.filter((l) => l.id !== INBOX_LIST_ID).length > 0
    if (localHasData) return { kind: 'push_local' }
  }
  return { kind: 'use_remote', lists: remoteLists, tasks: remoteTasks, habits: remoteHabits, sections: remoteSections }
}

const UPSERT_BATCH = 500
const DELETE_BATCH = 100
/**
 * 1 回の送信で切り分ける行と問い合わせの上限。超えたら 1 行ずつの問題ではなく全体の問題として送信を止める
 * （全行が落ちるときに数百回問い合わせない）
 */
const MAX_REJECTED = 20
const MAX_ISOLATE_REQUESTS = 80

export type SyncTable = 'lists' | 'list_sections' | 'tasks' | 'habits'

/** サーバーに受け付けられなかった行。手元には残り、直すまで同じ内容は送り直さない */
export type SyncRejectedRow = { table: SyncTable; id: string; op: 'upsert' | 'delete'; message: string }

/**
 * その行だけの問題か（値の形・大きさ・参照先が無いなど。Postgres の 22xxx・23xxx）。
 * 列が無い・回線・認証などは全体の問題なので、行を切り分けずに送信を止める
 */
function isRowLevelError(code: string | undefined): boolean {
  return !!code && (code.startsWith('22') || code.startsWith('23'))
}

/** 拒否された行と、そのとき送った内容。同じ内容なら次の同期で送り直さない（毎分切り分け直さない） */
const knownRejected = new Map<string, { row: string; message: string }>()

export async function pushListsTasksHabits(
  supabase: SupabaseClient,
  userId: string,
  lists: TaskList[],
  tasks: Task[],
  habits: Habit[],
  sections: ListSection[],
  /**
   * 三方向マージで決めた削除対象。これだけを消す。以前の「ローカルに無い行を全部消す」は、
   * 取得〜push の間に他端末が追加した行や、ゲストのデータでログインした端末からアカウントの行を消していた
   */
  deletes: SyncDeletes,
  /**
   * 直前に取得したサーバーの内容。渡すと、それと同じ行は送らない。以前は 1 分ごとの同期のたびに
   * 全行を送っていて、通信量が大きいうえ、取得から送信までの間に他の端末で直した行を古い内容で上書きしていた
   */
  remote?: { lists: TaskList[]; tasks: Task[]; habits: Habit[]; sections: ListSection[] },
): Promise<{ error?: string; rejected: SyncRejectedRow[] }> {
  /** この送信で受け付けられなかった行（キーは `table:id`） */
  const rejected = new Map<string, SyncRejectedRow>()
  const rejectKey = (table: SyncTable, id: string) => `${userId}:${table}:${id}`
  const changedOnly = <T extends { id: string }, R>(
    table: SyncTable,
    items: T[],
    remoteItems: T[] | undefined,
    toRow: (x: T) => R,
    /** 比べる前にそろえる（送る行そのものは変えない） */
    normalize: (x: T) => T = (x) => x,
  ): R[] => {
    const sent = remoteItems ? new Map(remoteItems.map((x) => [x.id, JSON.stringify(toRow(normalize(x)))])) : null
    const rows: R[] = []
    items.forEach((item) => {
      const row = toRow(item)
      const json = JSON.stringify(row)
      if (sent?.get(item.id) === JSON.stringify(toRow(normalize(item)))) return
      const known = knownRejected.get(rejectKey(table, item.id))
      if (known?.row === json) {
        rejected.set(`${table}:${item.id}`, { table, id: item.id, op: 'upsert', message: known.message })
        return
      }
      rows.push(row)
    })
    return rows
  }
  const listRows = changedOnly('lists', lists, remote?.lists, (l) => listToRow(userId, l))
  const sectionRows = changedOnly('list_sections', sections, remote?.sections, (s) => sectionToRow(userId, s))
  // 端末ごとにアプリのタイムゾーンが違うと、同じ瞬間でも列の書き方（timeZoneAnchor と時刻）が違う。
  // 両方をこの端末のタイムゾーンの書き方にそろえてから比べ、書き方の違いだけでは送らない（2 台で全件を送り合わない）
  const taskRows = changedOnly('tasks', tasks, remote?.tasks, (t) => taskToRow(userId, t), (t) => reanchorTask(t))
  const habitRows = changedOnly('habits', habits, remote?.habits, (h) => habitToRow(userId, h))
  let isolateRequests = 0
  /** 行だけの問題なら切り分けを続けてよいか。上限を超えたら全体の失敗にする */
  const canIsolate = (code: string | undefined) =>
    isRowLevelError(code) && rejected.size < MAX_REJECTED && isolateRequests < MAX_ISOLATE_REQUESTS
  const finish = (error?: string): { error?: string; rejected: SyncRejectedRow[] } => {
    const out = [...rejected.values()]
    if (error) return { error, rejected: out }
    // 送れた行は覚えを消し、拒否された行は送った内容を覚える
    const sentRows: [SyncTable, { id: string }[]][] = [
      ['lists', listRows],
      ['list_sections', sectionRows],
      ['tasks', taskRows],
      ['habits', habitRows],
    ]
    for (const [table, rows] of sentRows) {
      for (const row of rows) {
        const r = rejected.get(`${table}:${row.id}`)
        if (r?.op === 'upsert') knownRejected.set(rejectKey(table, row.id), { row: JSON.stringify(row), message: r.message })
        else knownRejected.delete(rejectKey(table, row.id))
      }
    }
    return { rejected: out }
  }

  // 主キーは (user_id, id)。主キーが id だけの古い DB には一致する一意制約が無いので id で送り直す
  // （その DB では 2 人目以降の利用者は同期できない。001 を流し直して主キーを直す）
  let onConflict = 'user_id,id'
  const upsertBatch = async (table: SyncTable, rows: { id: string }[]) => {
    let { error } = await supabase.from(table).upsert(rows, { onConflict })
    if (error && onConflict !== 'id' && /no unique or exclusion constraint/i.test(error.message)) {
      onConflict = 'id'
      ;({ error } = await supabase.from(table).upsert(rows, { onConflict }))
    }
    return error ?? undefined
  }
  /**
   * 1 行でも拒否されるとまとめて落ちる。行だけの問題なら半分ずつに分けて拒否された行を見つけ、
   * ほかの行は送る（以前は 1 行のせいで同期がずっと止まっていた）
   */
  const upsertIsolating = async (table: SyncTable, rows: { id: string }[]): Promise<string | undefined> => {
    const error = await upsertBatch(table, rows)
    if (!error) return undefined
    if (!canIsolate(error.code)) return error.message
    if (rows.length === 1) {
      rejected.set(`${table}:${rows[0].id}`, { table, id: rows[0].id, op: 'upsert', message: error.message })
      return undefined
    }
    isolateRequests += 2
    const mid = Math.ceil(rows.length / 2)
    return (await upsertIsolating(table, rows.slice(0, mid))) ?? (await upsertIsolating(table, rows.slice(mid)))
  }
  // 初回などで行が多いと 1 回の本文が大きくなりすぎるので分けて送る
  const upsert = async (table: SyncTable, rows: { id: string }[]) => {
    for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
      const error = await upsertIsolating(table, rows.slice(i, i + UPSERT_BATCH))
      if (error) return error
    }
    return undefined
  }
  const deleteIsolating = async (table: SyncTable, ids: string[]): Promise<string | undefined> => {
    const { error } = await supabase.from(table).delete().eq('user_id', userId).in('id', ids)
    if (!error) return undefined
    if (!canIsolate(error.code)) return error.message
    if (ids.length === 1) {
      rejected.set(`${table}:${ids[0]}`, { table, id: ids[0], op: 'delete', message: error.message })
      return undefined
    }
    isolateRequests += 2
    const mid = Math.ceil(ids.length / 2)
    return (await deleteIsolating(table, ids.slice(0, mid))) ?? (await deleteIsolating(table, ids.slice(mid)))
  }

  let e1 = await upsert('lists', listRows)
  // 古い DB では kind 列が無い。種類なしで送り直す（列を足せば次回から自動で送る）
  if (e1 && /kind/.test(e1)) {
    e1 = await upsert('lists', listRows.map((row) => ({ ...row, kind: undefined })))
  }
  if (e1) return finish(e1)

  const eSec = await upsert('list_sections', sectionRows)
  if (eSec) return finish(eSec)

  // 列が無い古い DB 互換。フラグは「この push 呼び出し内」だけで持ち、
  // 毎回フル列で送り直すので、後から列を追加すれば次回同期で自動復帰する
  // （ページ再読み込み不要）。
  let stripEndDate = false
  let stripCompletedAt = false
  let stripLocation = false
  let stripColor = false
  let stripHabitId = false
  let stripIsSleep = false
  let stripTimeZone = false
  let stripReminders = false
  let stripDueTime = false
  let stripScheduledDate = false
  let stripArchivedAt = false
  let stripDeletedAt = false
  const upsertTasksRows = async (): Promise<string | undefined> => {
    let rows: TaskRow[] = taskRows
    if (stripEndDate) rows = stripEndDateFromTaskRows(rows)
    if (stripCompletedAt) rows = stripCompletedAtFromTaskRows(rows)
    if (stripLocation) rows = stripLocationFromTaskRows(rows)
    if (stripColor) rows = stripColorFromTaskRows(rows)
    if (stripHabitId) rows = stripHabitIdFromTaskRows(rows)
    if (stripIsSleep) rows = stripIsSleepFromTaskRows(rows)
    if (stripTimeZone) rows = stripTimeZoneFromTaskRows(rows)
    if (stripReminders) rows = stripRemindersFromTaskRows(rows)
    if (stripDueTime) rows = stripDueTimeFromTaskRows(rows)
    if (stripScheduledDate) rows = stripScheduledDateFromTaskRows(rows)
    if (stripArchivedAt) rows = stripArchivedAtFromTaskRows(rows)
    if (stripDeletedAt) rows = stripDeletedAtFromTaskRows(rows)
    return upsert('tasks', rows)
  }
  for (let attempt = 0; attempt < 13; attempt++) {
    const errMsg = await upsertTasksRows()
    if (!errMsg) break
    if (isMissingEndDateColumnError(errMsg) && !stripEndDate) {
      stripEndDate = true
      continue
    }
    if (isMissingCompletedAtColumnError(errMsg) && !stripCompletedAt) {
      stripCompletedAt = true
      continue
    }
    if (isMissingLocationColumnError(errMsg) && !stripLocation) {
      stripLocation = true
      continue
    }
    if (isMissingColorColumnError(errMsg) && !stripColor) {
      stripColor = true
      continue
    }
    if (isMissingHabitIdColumnError(errMsg) && !stripHabitId) {
      stripHabitId = true
      continue
    }
    if (isMissingIsSleepColumnError(errMsg) && !stripIsSleep) {
      stripIsSleep = true
      continue
    }
    if (isMissingRemindersColumnError(errMsg) && !stripReminders) {
      stripReminders = true
      continue
    }
    if (isMissingTimeZoneColumnError(errMsg) && !stripTimeZone) {
      stripTimeZone = true
      continue
    }
    if (isMissingDueTimeColumnError(errMsg) && !stripDueTime) {
      stripDueTime = true
      continue
    }
    if (isMissingScheduledDateColumnError(errMsg) && !stripScheduledDate) {
      stripScheduledDate = true
      continue
    }
    if (isMissingArchivedAtColumnError(errMsg) && !stripArchivedAt) {
      stripArchivedAt = true
      continue
    }
    if (isMissingDeletedAtColumnError(errMsg) && !stripDeletedAt) {
      stripDeletedAt = true
      continue
    }
    return finish(errMsg)
  }

  let eH = await upsert('habits', habitRows)
  // `003` を流す前の DB には archived_at が無い。アーカイブなしで送り直す（列を足せば次回から送る）
  if (isMissingArchivedAtColumnError(eH)) {
    eH = await upsert('habits', habitRows.map(({ archived_at, ...rest }) => {
      void archived_at
      return rest
    }))
  }
  if (eH) return finish(eH)

  // 子 → 親の順（tasks → habits → sections → lists）
  for (const [table, ids] of [
    ['tasks', deletes.tasks],
    ['habits', deletes.habits],
    ['list_sections', deletes.sections],
    ['lists', deletes.lists],
  ] as const) {
    // id は URL に並ぶので、数百件を一度に消すと URL が長すぎて失敗し、同期が詰まり続けていた
    for (let i = 0; i < ids.length; i += DELETE_BATCH) {
      const error = await deleteIsolating(table, ids.slice(i, i + DELETE_BATCH))
      if (error) return finish(error)
    }
  }
  return finish()
}

/** ラベル表（`user_settings.log_labels`）。行が無ければ null */
export async function fetchLogLabels(
  supabase: SupabaseClient,
  userId: string,
): Promise<RemoteLabels | null | { error: string }> {
  const { data, error } = await supabase.from('user_settings').select('log_labels, updated_at').eq('user_id', userId).maybeSingle()
  if (error) return { error: error.message }
  if (!data) return null
  const rows = Array.isArray(data.log_labels) ? (data.log_labels as unknown[]) : []
  const labels = rows.flatMap((r) => {
    const x = r as { name?: unknown; color?: unknown }
    return typeof x.name === 'string' ? [{ name: x.name, color: typeof x.color === 'string' ? x.color : '' }] : []
  })
  return { labels, updatedAt: String(data.updated_at) }
}

export async function pushLogLabels(supabase: SupabaseClient, userId: string, labels: RemoteLabels): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: userId, log_labels: labels.labels, updated_at: labels.updatedAt }, { onConflict: 'user_id' })
  return error ? { error: error.message } : {}
}

/** 他のタイムゾーンと付けた名前（`user_extra_time_zones.zones`）。行が無ければ null */
export async function fetchExtraTimeZones(
  supabase: SupabaseClient,
  userId: string,
): Promise<RemoteExtraTimeZones | null | { error: string }> {
  const { data, error } = await supabase.from('user_extra_time_zones').select('zones, updated_at').eq('user_id', userId).maybeSingle()
  if (error) return { error: error.message }
  if (!data) return null
  return { zones: normalizeExtraTimeZones(data.zones), updatedAt: String(data.updated_at) }
}

export async function pushExtraTimeZones(supabase: SupabaseClient, userId: string, value: RemoteExtraTimeZones): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('user_extra_time_zones')
    .upsert({ user_id: userId, zones: value.zones, updated_at: value.updatedAt }, { onConflict: 'user_id' })
  return error ? { error: error.message } : {}
}
