import type { SupabaseClient } from '@supabase/supabase-js'
import { isEventTask, isLogTask, isSleepTask, taskKindFromFlags, type Task } from '../types/task'
import type { TaskReminder } from '../../supabase/functions/daily-reminders/schedule.ts'
import { normalizeListKind, type TaskList } from '../types/list'
import type { ListSection } from '../types/section'
import { inferHabitTimeMode, readHabitFrequency, readHabitTimeOverrides, type Habit } from '../types/habit'
import { INBOX_LIST_ID } from '../store/taskStore'
import type { SyncDeletes } from './syncMerge'
import { reanchorTask } from './taskTimeZone'
import { withLogCategory } from './taskDefaults'
import type { RemoteLabels } from './labelSync'
import type { SettingPushResult } from './settingSync'
import { normalizeExtraTimeZones, type RemoteExtraTimeZones } from './extraTimeZones'
import { buildRecurrence } from './recurrence'
import { readEstimateMinutes } from './estimate'

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
  /** 日ごとの時間（`018`）。古い DB には無い。無い・null は無し */
  time_overrides?: unknown
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
  /** 古い DB には無い（`015`） */
  estimate_minutes?: number | null
  /** 古い DB には無い（`016`） */
  source_task_id?: string | null
  /** 古い DB には無い */
  color?: string | null
  /** 古い DB には無い */
  habit_id?: string | null
  /** 古い DB には無い */
  is_sleep?: boolean | null
  /** 古い DB には無い（`014`） */
  is_event?: boolean | null
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

function sectionToRow(userId: string, sec: ListSection): SectionRow {
  return {
    id: sec.id,
    user_id: userId,
    list_id: sec.listId,
    name: sec.name,
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
  const frequency = readHabitFrequency(row.frequency)
  const datesRaw = row.completed_dates
  const completedDates = Array.isArray(datesRaw) ? datesRaw.filter((d): d is string => typeof d === 'string') : []
  const inferredMode = inferHabitTimeMode(row.start_time, row.end_time)
  const timeMode = row.time_mode === 'none' || row.time_mode === 'fixed' || row.time_mode === 'range' ? row.time_mode : inferredMode
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
    ...withTimeOverrides(row.time_overrides),
  }
}

/** 日ごとの時間は、1 日でもあるときだけ項目を持つ（無い行どうしを「変わった」と見ない） */
function withTimeOverrides(raw: unknown): Pick<Habit, 'timeOverrides'> {
  const timeOverrides = readHabitTimeOverrides(raw)
  return timeOverrides ? { timeOverrides } : {}
}

function habitToRow(userId: string, h: Habit): HabitRow {
  return {
    id: h.id,
    user_id: userId,
    title: h.title,
    color: h.color,
    time_mode: h.timeMode,
    start_time: h.startTime,
    end_time: h.endTime,
    frequency: h.frequency,
    completed_dates: h.completedDates,
    created_at: h.createdAt,
    updated_at: h.updatedAt,
    archived_at: h.archivedAt ?? null,
    time_overrides: h.timeOverrides ?? null,
  }
}

/** 壊れた要素は捨てる。配列でなければ既定（null） */
export function parseReminders(raw: unknown): TaskReminder[] | null {
  if (!Array.isArray(raw)) return null
  return raw.filter(
    (r): r is TaskReminder =>
      typeof r === 'object' &&
      r !== null &&
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
    if ((type === 'daily' || type === 'weekly' || type === 'monthly' || type === 'yearly') && typeof interval === 'number') {
      recurrence = buildRecurrence(type, interval, r.weekdays, r.monthDay)
    }
  }
  const priority =
    row.priority === 'low' || row.priority === 'medium' || row.priority === 'high' || row.priority === 'none' ? row.priority : 'none'
  const completedAt = typeof row.completed_at === 'string' ? row.completed_at : row.completed ? row.updated_at : null
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
    estimateMinutes: readEstimateMinutes(row.estimate_minutes),
    color: typeof row.color === 'string' ? row.color : null,
    priority,
    tags,
    category: typeof row.category === 'string' ? row.category : null,
    recurrence,
    kind: taskKindFromFlags(row.is_time_log === true, row.is_sleep === true, row.is_event === true),
    habitId: typeof row.habit_id === 'string' ? row.habit_id : null,
    sourceTaskId: typeof row.source_task_id === 'string' ? row.source_task_id : null,
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
    name: list.name,
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
    section_id: task.sectionId,
    title: task.title,
    description: task.description,
    completed: task.completed,
    completed_at: task.completedAt,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
    sort_order: task.order,
    due_date: task.dueDate,
    due_time: task.dueTime,
    scheduled_date: task.scheduledDate,
    end_date: task.endDate,
    start_time: task.startTime,
    end_time: task.endTime,
    location: task.location ?? null,
    estimate_minutes: task.estimateMinutes,
    color: task.color,
    priority: task.priority,
    tags: task.tags,
    category: isLogTask(task) ? task.category : null,
    recurrence: task.recurrence,
    // 種類はサーバーでは印の列（記録か・睡眠か・予定か）。前の版の端末も同じ列を読む（予定の印を読まない版では To-Do）
    is_time_log: isLogTask(task),
    habit_id: task.habitId,
    source_task_id: task.sourceTaskId,
    is_sleep: isSleepTask(task),
    is_event: isEventTask(task),
    time_zone: task.timeZone,
    time_zone_anchor: task.timeZoneAnchor,
    reminders: task.reminders,
    archived_at: task.archivedAt,
    deleted_at: task.deletedAt,
  }
}

/** 1 回の取得の行数。Supabase の API は既定で 1,000 行までしか返さない */
const PAGE_SIZE = 1000

/**
 * 利用者の行を全部取る。1 回で取ると上限（既定 1,000 行）で切れ、返ってこなかった行が
 * 三方向マージで「他端末で消された」扱いになって手元から消えていた。
 * id 順に、続きは最後に受け取った id より後（keyset）から、空のページが返るまで取る。
 * 取っている間に他端末が行を消しても後ろの行はずれず、行が変わっても id は変わらないので、飛ばしも重複も無い
 * （offset で送ると、前の方の行が消えた分だけ後ろの行を取り飛ばしていた）。
 * サーバーの上限がページの大きさより小さくても、空になるまで送るので取りこぼさない
 */
async function fetchAllRows<T extends { id: string }>(
  supabase: SupabaseClient,
  table: string,
  userId: string,
): Promise<{ rows: T[] } | { error: string }> {
  const rows: T[] = []
  for (;;) {
    let q = supabase.from(table).select('*').eq('user_id', userId)
    const last = rows[rows.length - 1]
    if (last) q = q.gt('id', last.id)
    const { data, error } = await q.order('id').limit(PAGE_SIZE)
    // 途中で失敗したら、途中までの結果ではマージしない（足りない行が「消された」扱いになる）
    if (error) return { error: `${table}: ${error.message}` }
    const page = (data ?? []) as T[]
    if (page.length === 0) break
    rows.push(...page)
  }
  return { rows }
}

export async function fetchListsTasksHabits(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ lists: TaskList[]; tasks: Task[]; habits: Habit[]; sections: ListSection[] } | { error: string }> {
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

/** 消えた行の印（`008` の sync_tombstones）。印があれば、その行はいまサーバーに無い */
export type SyncTombstone = { table: SyncTable; id: string; deletedAt: string }

/** 前回の取得より後に変わった行と、消えた行の印 */
export interface SyncChanges {
  lists: TaskList[]
  sections: ListSection[]
  tasks: Task[]
  habits: Habit[]
  tombstones: SyncTombstone[]
  /** `since` より後の印のうち、サーバーが上限で消したものがある（`010` の sync_tombstone_purges）。差分では消えた行が分からないので、全部を取り直す */
  tombstonesTrimmed: boolean
}

const SYNC_TABLES: readonly SyncTable[] = ['lists', 'list_sections', 'tasks', 'habits']

/**
 * `since` より後の行を、`keys` の順（先頭は時刻の列）に全部取る。続きは最後の行より後（keyset）から取るので、
 * 取っている間に行が消えたり変わったりしても飛ばさない（変わった行は後ろへ回り、続きか次の取得で届く）。
 * 件数は最初の 1 回だけ数える（`since` より後だけなので、索引で軽い）
 */
async function fetchRowsSince<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  table: string,
  userId: string,
  since: string,
  keys: readonly [string, ...string[]],
): Promise<{ rows: T[] } | { error: string }> {
  const rows: T[] = []
  let total: number | null = null
  for (;;) {
    let q = supabase
      .from(table)
      .select('*', rows.length === 0 ? { count: 'exact' } : undefined)
      .eq('user_id', userId)
      .gt(keys[0], since)
    const last = rows[rows.length - 1]
    if (last) {
      // (k1, k2, …) > (最後の行の値): k1 > v1 か、k1 = v1 で k2 > v2 か …
      const v = (k: string) => quoteFilterValue(String(last[k]))
      const parts = keys.map((k, i) => {
        const eqs = keys.slice(0, i).map((p) => `${p}.eq.${v(p)}`)
        return eqs.length === 0 ? `${k}.gt.${v(k)}` : `and(${[...eqs, `${k}.gt.${v(k)}`].join(',')})`
      })
      q = q.or(parts.join(','))
    }
    for (const k of keys) q = q.order(k)
    const { data, count, error } = await q.limit(PAGE_SIZE)
    if (error) return { error: error.message }
    if (rows.length === 0) total = count ?? null
    const page = (data ?? []) as T[]
    if (page.length === 0) break
    rows.push(...page)
    if (total !== null && rows.length >= total) break
  }
  return { rows }
}

/**
 * サーバーの時刻（`008` の `sync_server_now()`）。差分の取得の目印に使う（端末の時計は使わない）。
 * 取れなければ（関数が無い・PostgREST の一覧が古いときも）同期の失敗
 */
export async function fetchServerNow(supabase: SupabaseClient): Promise<{ at: string } | { error: string }> {
  const { data, error } = await supabase.rpc('sync_server_now')
  if (error) return { error: `sync_server_now: ${error.message}` }
  const at = typeof data === 'string' ? data : null
  if (!at || !Number.isFinite(Date.parse(at))) return { error: 'sync_server_now: bad value' }
  return { at }
}

/**
 * 差分の取得: `since` より後に変わった行と、`since` より後に消えた行の印。
 * 行を先に、印を後に取る（印は取った時点でその行がサーバーに無いことを示すので、行より後に取れば行の取得と食い違わない）。
 * 印の表（`008`）・上限で消した印の表（`010`）が読めなければ同期の失敗（読めないのを「印は無い」とすると、
 * ほかの端末で消した行が次の全部の取得まで手元に残る）
 */
export async function fetchChangesSince(supabase: SupabaseClient, userId: string, since: string): Promise<SyncChanges | { error: string }> {
  const got: Partial<Record<SyncTable, Record<string, unknown>[]>> = {}
  for (const table of SYNC_TABLES) {
    const res = await fetchRowsSince(supabase, table, userId, since, ['updated_at', 'id'])
    if ('error' in res) return { error: `${table}: ${res.error}` }
    got[table] = res.rows
  }
  const ts = await fetchRowsSince<{ table_name: string; row_id: string; deleted_at: string }>(supabase, 'sync_tombstones', userId, since, [
    'deleted_at',
    'table_name',
    'row_id',
  ])
  if ('error' in ts) return { error: `sync_tombstones: ${ts.error}` }
  // 上限で消した印の一番新しい時刻（`010`）。印を取った後に読むので、取った印より前に消えた分は必ず見える
  const trimmed = await supabase
    .from('sync_tombstone_purges')
    .select('last_deleted_at')
    .eq('user_id', userId)
    .gt('last_deleted_at', since)
    .limit(1)
  if (trimmed.error) return { error: `sync_tombstone_purges: ${trimmed.error.message}` }
  return {
    lists: (got.lists as unknown as ListRow[]).map(rowToList),
    sections: (got.list_sections as unknown as SectionRow[]).map(rowToSection),
    tasks: (got.tasks as unknown as TaskRow[]).map(rowToTask),
    habits: (got.habits as unknown as HabitRow[]).map(rowToHabit),
    tombstones: ts.rows
      .filter((r) => (SYNC_TABLES as readonly string[]).includes(r.table_name))
      .map((r) => ({ table: r.table_name as SyncTable, id: String(r.row_id), deletedAt: String(r.deleted_at) })),
    tombstonesTrimmed: (trimmed.data ?? []).length > 0,
  }
}

/** Remote is only default inbox and no tasks (and no extra lists / habits). */
function isTrivialRemote(lists: TaskList[], tasks: Task[], habits: Habit[], sections: ListSection[]): boolean {
  if (tasks.length > 0 || habits.length > 0 || sections.length > 0) return false
  const nonInbox = lists.filter((l) => l.id !== INBOX_LIST_ID)
  return nonInbox.length === 0
}

export type HydrateDecision =
  { kind: 'use_remote'; lists: TaskList[]; tasks: Task[]; habits: Habit[]; sections: ListSection[] } | { kind: 'push_local' }

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
      localTasks.length > 0 ||
      localHabits.length > 0 ||
      localSections.length > 0 ||
      localLists.filter((l) => l.id !== INBOX_LIST_ID).length > 0
    if (localHasData) return { kind: 'push_local' }
  }
  return { kind: 'use_remote', lists: remoteLists, tasks: remoteTasks, habits: remoteHabits, sections: remoteSections }
}

const UPSERT_BATCH = 500
const DELETE_BATCH = 100
const CONDITIONAL_DELETE_BATCH = 25
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

/** サーバーが受け付けた行と、サーバーが付けた更新時刻（`004` を流す前の DB では送った値のまま） */
export type SyncWrittenRow = { table: SyncTable; id: string; updatedAt: string }

/**
 * 取得した後に他の端末が変えていたので、サーバーが断った行（書き込み・削除）。
 * エラーではない。次の同期で新しい版を取り直し、項目ごとに合わせて送り直す
 */
export type SyncStaleRow = { table: SyncTable; id: string; op: 'upsert' | 'delete' }

export interface SyncPushResult {
  error?: string
  rejected: SyncRejectedRow[]
  written: SyncWrittenRow[]
  stale: SyncStaleRow[]
  /** サーバーの時計 − この端末の時計（ms）。サーバーが時刻を付けた行があったときだけ */
  clockOffsetMs?: number
}

/** 取得に無かった行を送るときの「もとにした版」。サーバーに同じ id の行ができていたら断られる */
const BASE_ABSENT = '-infinity'

/** PostgREST の or / and の中で値をそのまま使えるように引用符で囲む */
function quoteFilterValue(v: string): string {
  return `"${v.replace(/["\\]/g, (c) => `\\${c}`)}"`
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
): Promise<SyncPushResult> {
  /** この送信で受け付けられなかった行（キーは `table:id`） */
  const rejected = new Map<string, SyncRejectedRow>()
  const written: SyncWrittenRow[] = []
  const stale: SyncStaleRow[] = []
  let clockOffsetMs: number | undefined
  /**
   * 行ごとの「もとにした版」＝取得したときのサーバーの updated_at（文字列のまま。マイクロ秒まで一致させる）。
   * 取得を渡されないとき（古い呼び方）は送らない＝前と同じ書き込み
   */
  const bases: Record<SyncTable, Map<string, string>> | null = remote
    ? {
        lists: new Map(remote.lists.map((x) => [x.id, x.updatedAt ?? UNKNOWN_UPDATED_AT])),
        list_sections: new Map(remote.sections.map((x) => [x.id, x.updatedAt ?? UNKNOWN_UPDATED_AT])),
        tasks: new Map(remote.tasks.map((x) => [x.id, x.updatedAt])),
        habits: new Map(remote.habits.map((x) => [x.id, x.updatedAt])),
      }
    : null
  /** 版（`base_updated_at`）を付けて送る。本番の DB は `004` 以降なので、版の確かめを外して送り直すことはしない */
  const sendBase = bases !== null
  const rejectKey = (table: SyncTable, id: string) => `${userId}:${table}:${id}`
  const changedOnly = <T extends { id: string }, R>(
    table: SyncTable,
    items: T[],
    remoteItems: T[] | undefined,
    toRow: (x: T) => R,
    /** 比べる前にそろえる（送る行そのものは変えない） */
    normalize: (x: T) => T = (x) => x,
  ): R[] => {
    // 更新時刻は比べない（サーバーが付け直すので、中身が同じでも手元の時刻とは違う）
    const content = (x: T) => JSON.stringify({ ...toRow(normalize(x)), updated_at: undefined })
    const sent = remoteItems ? new Map(remoteItems.map((x) => [x.id, content(x)])) : null
    const rows: R[] = []
    items.forEach((item) => {
      const row = toRow(item)
      const json = JSON.stringify(row)
      if (sent?.get(item.id) === content(item)) return
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
  const taskRows = changedOnly(
    'tasks',
    tasks,
    remote?.tasks,
    (t) => taskToRow(userId, t),
    (t) => reanchorTask(t),
  )
  const habitRows = changedOnly('habits', habits, remote?.habits, (h) => habitToRow(userId, h))
  let isolateRequests = 0
  /** 行だけの問題なら切り分けを続けてよいか。上限を超えたら全体の失敗にする */
  const canIsolate = (code: string | undefined) =>
    isRowLevelError(code) && rejected.size < MAX_REJECTED && isolateRequests < MAX_ISOLATE_REQUESTS
  const finish = (error?: string): SyncPushResult => {
    const out = [...rejected.values()]
    if (error) return { error, rejected: out, written, stale, clockOffsetMs }
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
        // base_updated_at の制約で落ちたのは行の中身のせいではない（取得と送信の間に行が消えた）。覚えずに次も送る
        if (r?.op === 'upsert' && !r.message.includes('base_updated_at'))
          knownRejected.set(rejectKey(table, row.id), { row: JSON.stringify(row), message: r.message })
        else knownRejected.delete(rejectKey(table, row.id))
      }
    }
    return { rejected: out, written, stale, clockOffsetMs }
  }

  // 主キーは (user_id, id)
  const onConflict = 'user_id,id'
  const send = (table: SyncTable, rows: { id: string }[]) => {
    const body = sendBase && bases ? rows.map((r) => ({ ...r, base_updated_at: bases[table].get(r.id) ?? BASE_ABSENT })) : rows
    // 受け付けた行だけが返る。返らなかった行は、取得した後に他の端末が変えていた（サーバーが断った）
    return supabase.from(table).upsert(body, { onConflict }).select('id, updated_at')
  }
  const upsertBatch = async (table: SyncTable, rows: { id: string }[]) => {
    const startedAt = Date.now()
    const { data, error } = await send(table, rows)
    if (error) return error
    const midpoint = (startedAt + Date.now()) / 2
    const sentStamp = new Map(rows.map((r) => [r.id, Date.parse((r as { updated_at?: string }).updated_at ?? '')]))
    const back = new Map(((data ?? []) as { id: string; updated_at: string }[]).map((r) => [r.id, String(r.updated_at)]))
    for (const r of rows) {
      const at = back.get(r.id)
      if (at === undefined) {
        stale.push({ table, id: r.id, op: 'upsert' })
        continue
      }
      written.push({ table, id: r.id, updatedAt: at })
      // サーバーが付けた時刻（送った値と違う）から時計のずれを測る。前の値より新しくするために進めた時刻もあるので、一番小さいものを使う。
      // 前の値（未来の時刻のこともある）の 1 マイクロ秒後に進めた時刻はサーバーの時計ではないので測らない
      const ms = Date.parse(at)
      const baseMs = Date.parse(bases?.[table].get(r.id) ?? '')
      const bumped = Number.isFinite(baseMs) && ms - baseMs <= 1
      if (sendBase && Number.isFinite(ms) && ms !== sentStamp.get(r.id) && !bumped) {
        const offset = Math.round(ms - midpoint)
        clockOffsetMs = clockOffsetMs === undefined ? offset : Math.min(clockOffsetMs, offset)
      }
    }
    return undefined
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
    const base = bases?.[table]
    // 版のある行（取得した行）は版つきで、版の無い行（取得に無かった行）だけ無条件で消す。
    // 以前は 1 行でも版の無い行が混ざると、まとめて無条件の削除になり、取得した後に他の端末が直した行も消えていた
    const versioned = base ? ids.filter((id) => base.has(id)) : []
    const unversioned = base ? ids.filter((id) => !base.has(id)) : ids
    let error: { code?: string; message: string } | null = null
    if (versioned.length > 0) {
      // 取得したときのままの行だけ消す。取得した後に他の端末が変えた行は残し、次の同期で取り込む
      const match = versioned.map((id) => `and(id.eq.${quoteFilterValue(id)},updated_at.eq.${quoteFilterValue(base!.get(id)!)})`).join(',')
      const res = await supabase.from(table).delete().eq('user_id', userId).or(match).select('id')
      error = res.error
      if (!error) {
        const gone = new Set(((res.data ?? []) as { id: string }[]).map((r) => r.id))
        for (const id of versioned) if (!gone.has(id)) stale.push({ table, id, op: 'delete' })
      }
    }
    if (!error && unversioned.length > 0) {
      ;({ error } = await supabase.from(table).delete().eq('user_id', userId).in('id', unversioned))
    }
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

  // 列が無い・版が通らないときは送り直さず同期の失敗にする（列を黙って落とすと、ゴミ箱・予定・アーカイブが黙って外れていた）
  const e1 = await upsert('lists', listRows)
  if (e1) return finish(e1)

  const eSec = await upsert('list_sections', sectionRows)
  if (eSec) return finish(eSec)

  const eT = await upsert('tasks', taskRows)
  if (eT) return finish(eT)

  const eH = await upsert('habits', habitRows)
  if (eH) return finish(eH)

  // 子 → 親の順（tasks → habits → sections → lists）
  for (const [table, ids] of [
    ['tasks', deletes.tasks],
    ['habits', deletes.habits],
    ['list_sections', deletes.sections],
    ['lists', deletes.lists],
  ] as const) {
    // id は URL に並ぶので、数百件を一度に消すと URL が長すぎて失敗し、同期が詰まり続けていた
    // 版を付けて消すときは 1 件あたりの URL が長いので、もっと細かく分ける
    const base = bases?.[table]
    const size = base && ids.some((id) => base.has(id)) ? CONDITIONAL_DELETE_BATCH : DELETE_BATCH
    for (let i = 0; i < ids.length; i += size) {
      const error = await deleteIsolating(table, ids.slice(i, i + size))
      if (error) return finish(error)
    }
  }
  return finish()
}

/** ラベル表（`user_settings.log_labels`）。行が無ければ null */
export async function fetchLogLabels(supabase: SupabaseClient, userId: string): Promise<RemoteLabels | null | { error: string }> {
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

/**
 * `user_settings` / `user_extra_time_zones` / `user_active_timer` の 1 行を送る。もとにした版（`base`、行が無ければ '-infinity'）を付け、
 * サーバーの行がその版のときだけ通る（`007` の settings_write_guard）。通った行の `updated_at` を返させる
 */
export async function pushSettingRow(
  supabase: SupabaseClient,
  table: 'user_settings' | 'user_extra_time_zones' | 'user_active_timer',
  row: Record<string, unknown> & { user_id: string; updated_at: string },
  base: string | null,
): Promise<SettingPushResult> {
  // 行が無いはずの書き込み（base が無い）は insert … on conflict do nothing。2 台が同時に初めて作るとき、
  // 後から来た方が先に作られた行を上書きせず、行が返らない（断られた）扱いになって取り直す
  const send = (body: Record<string, unknown>) =>
    supabase
      .from(table)
      .upsert(body, { onConflict: 'user_id', ignoreDuplicates: base === null })
      .select('updated_at')
  // 版の確かめ（`007`）を外して送り直すことはしない（端末の時計で比べる書き込みに落ちる）
  const { data, error } = await send({ ...row, base_updated_at: base ?? BASE_ABSENT })
  if (error) return { error: error.message }
  const back = ((data ?? []) as { updated_at?: unknown }[])[0]
  if (!back || back.updated_at == null) return { stale: true }
  return { updatedAt: String(back.updated_at) }
}

export function pushLogLabels(
  supabase: SupabaseClient,
  userId: string,
  labels: RemoteLabels,
  base: string | null,
): Promise<SettingPushResult> {
  return pushSettingRow(supabase, 'user_settings', { user_id: userId, log_labels: labels.labels, updated_at: labels.updatedAt }, base)
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

export function pushExtraTimeZones(
  supabase: SupabaseClient,
  userId: string,
  value: RemoteExtraTimeZones,
  base: string | null,
): Promise<SettingPushResult> {
  return pushSettingRow(supabase, 'user_extra_time_zones', { user_id: userId, zones: value.zones, updated_at: value.updatedAt }, base)
}

/** 同期の取り決めの版の下限（`app_config.min_sync_version`、017）。読めなければエラー（黙って送らない・黙って送るのどちらにもしない） */
export async function fetchMinSyncVersion(supabase: SupabaseClient): Promise<number | { error: string }> {
  const { data, error } = await supabase.from('app_config').select('value').eq('key', 'min_sync_version').maybeSingle()
  if (error) return { error: error.message }
  const v = Number((data as { value?: unknown } | null)?.value ?? 0)
  return Number.isFinite(v) ? v : 0
}
