import type { SupabaseClient } from '@supabase/supabase-js'
import type { Task } from '../types/task'
import { normalizeListKind, type TaskList } from '../types/list'
import type { ListSection } from '../types/section'
import { inferHabitTimeMode, type Habit, type HabitWeekday } from '../types/habit'
import { INBOX_LIST_ID } from '../store/taskStore'
import type { SyncDeletes } from './syncMerge'

interface ListRow {
  id: string
  user_id: string
  name: string
  color: string
  sort_order: number
  /** 004 で追加。古い DB には無い */
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
  /** 006 で追加。古い DB には無い */
  color?: string | null
  /** 007 で追加。古い DB には無い */
  habit_id?: string | null
  priority: string
  tags: unknown
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
  }
}

function sectionToRow(userId: string, sec: ListSection): SectionRow {
  return {
    id: sec.id,
    user_id: userId,
    list_id: sec.listId,
    name: sec.name,
    sort_order: sec.order,
    updated_at: new Date().toISOString(),
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
  }
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
  }
}

function rowToTask(row: TaskRow): Task {
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
      recurrence = { type, interval }
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
    recurrence,
    isTimeLog: row.is_time_log === true,
    habitId: typeof row.habit_id === 'string' ? row.habit_id : null,
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
    updated_at: new Date().toISOString(),
  }
}

function taskToRow(userId: string, task: Task): TaskRow {
  return {
    id: task.id,
    user_id: userId,
    list_id: task.listId,
    parent_id: task.parentId,
    section_id: task.sectionId ?? null,
    title: task.title,
    description: task.description,
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
    location: task.location ?? null,
    color: task.color ?? null,
    priority: task.priority,
    tags: task.tags,
    recurrence: task.recurrence,
    is_time_log: task.isTimeLog ?? false,
    habit_id: task.habitId ?? null,
    archived_at: task.archivedAt ?? null,
    deleted_at: task.deletedAt ?? null,
  }
}

export async function fetchListsTasksHabits(
  supabase: SupabaseClient,
  userId: string,
): Promise<
  { lists: TaskList[]; tasks: Task[]; habits: Habit[]; sections: ListSection[] } | { error: string }
> {
  const { data: listRows, error: e1 } = await supabase
    .from('lists')
    .select('*')
    .eq('user_id', userId)
  if (e1) return { error: e1.message }

  const { data: sectionRows, error: eSec } = await supabase
    .from('list_sections')
    .select('*')
    .eq('user_id', userId)
  if (eSec) return { error: eSec.message }

  const { data: taskRows, error: e2 } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
  if (e2) return { error: e2.message }

  const { data: habitRows, error: e3 } = await supabase
    .from('habits')
    .select('*')
    .eq('user_id', userId)
  if (e3) return { error: e3.message }

  const lists = ((listRows ?? []) as ListRow[]).map(rowToList)
  const sections = ((sectionRows ?? []) as SectionRow[]).map(rowToSection)
  const tasks = ((taskRows ?? []) as TaskRow[]).map(rowToTask)
  const habits = ((habitRows ?? []) as HabitRow[]).map(rowToHabit)
  return { lists, tasks, habits, sections }
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

export async function pushListsTasksHabits(
  supabase: SupabaseClient,
  userId: string,
  lists: TaskList[],
  tasks: Task[],
  habits: Habit[],
  sections: ListSection[],
  /**
   * 三方向マージで決めた削除対象。指定時はこれだけを消す（取得〜push の間に他端末が
   * 追加した行を消さないため）。未指定なら従来どおり「ローカルに無い行」を消す
   */
  deletes?: SyncDeletes,
): Promise<{ error?: string }> {
  const listRows = lists.map((l) => listToRow(userId, l))
  const sectionRows = sections.map((s) => sectionToRow(userId, s))
  const taskRows = tasks.map((t) => taskToRow(userId, t))
  const habitRows = habits.map((h) => habitToRow(userId, h))

  let { error: e1 } = await supabase.from('lists').upsert(listRows, { onConflict: 'id' })
  // 004 未適用の DB では kind 列が無い。種類なしで送り直す（列を足せば次回から自動で送る）
  if (e1 && /kind/.test(e1.message)) {
    ;({ error: e1 } = await supabase
      .from('lists')
      .upsert(listRows.map((row) => ({ ...row, kind: undefined })), { onConflict: 'id' }))
  }
  if (e1) return { error: e1.message }

  const { error: eSec } = await supabase.from('list_sections').upsert(sectionRows, { onConflict: 'id' })
  if (eSec) return { error: eSec.message }

  // 列が無い古い DB 互換。フラグは「この push 呼び出し内」だけで持ち、
  // 毎回フル列で送り直すので、後から列を追加すれば次回同期で自動復帰する
  // （ページ再読み込み不要）。
  let stripEndDate = false
  let stripCompletedAt = false
  let stripLocation = false
  let stripColor = false
  let stripHabitId = false
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
    if (stripDueTime) rows = stripDueTimeFromTaskRows(rows)
    if (stripScheduledDate) rows = stripScheduledDateFromTaskRows(rows)
    if (stripArchivedAt) rows = stripArchivedAtFromTaskRows(rows)
    if (stripDeletedAt) rows = stripDeletedAtFromTaskRows(rows)
    const { error } = await supabase.from('tasks').upsert(rows, { onConflict: 'id' })
    return error?.message
  }
  for (let attempt = 0; attempt < 10; attempt++) {
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
    return { error: errMsg }
  }

  const { error: eH } = await supabase.from('habits').upsert(habitRows, { onConflict: 'id' })
  if (eH) return { error: eH.message }

  if (deletes) {
    // 子 → 親の順（tasks → habits → sections → lists）
    for (const [table, ids] of [
      ['tasks', deletes.tasks],
      ['habits', deletes.habits],
      ['list_sections', deletes.sections],
      ['lists', deletes.lists],
    ] as const) {
      if (ids.length === 0) continue
      const { error } = await supabase.from(table).delete().eq('user_id', userId).in('id', ids)
      if (error) return { error: error.message }
    }
    return {}
  }

  // Delete stale tasks first (child records)
  const localTaskIds = new Set(tasks.map((t) => t.id))
  const { data: remoteTaskIds, error: e5 } = await supabase.from('tasks').select('id').eq('user_id', userId)
  if (e5) return { error: e5.message }
  const toDeleteTasks =
    remoteTaskIds?.map((r) => r.id as string).filter((id) => !localTaskIds.has(id)) ?? []
  if (toDeleteTasks.length > 0) {
    const { error: e6 } = await supabase.from('tasks').delete().in('id', toDeleteTasks)
    if (e6) return { error: e6.message }
  }

  // Delete stale habits
  const localHabitIds = new Set(habits.map((h) => h.id))
  const { data: remoteHabitIds, error: e7 } = await supabase.from('habits').select('id').eq('user_id', userId)
  if (e7) return { error: e7.message }
  const toDeleteHabits =
    remoteHabitIds?.map((r) => r.id as string).filter((id) => !localHabitIds.has(id)) ?? []
  if (toDeleteHabits.length > 0) {
    const { error: e8 } = await supabase.from('habits').delete().in('id', toDeleteHabits)
    if (e8) return { error: e8.message }
  }

  const localSectionIds = new Set(sections.map((s) => s.id))
  const { data: remoteSectionIds, error: eSecDel } = await supabase
    .from('list_sections')
    .select('id')
    .eq('user_id', userId)
  if (eSecDel) return { error: eSecDel.message }
  const toDeleteSections =
    remoteSectionIds?.map((r) => r.id as string).filter((id) => !localSectionIds.has(id)) ?? []
  if (toDeleteSections.length > 0) {
    const { error: eSecDel2 } = await supabase.from('list_sections').delete().in('id', toDeleteSections)
    if (eSecDel2) return { error: eSecDel2.message }
  }

  // Delete stale lists last (parent records)
  const localListIds = new Set(lists.map((l) => l.id))
  const { data: remoteListIds, error: e3 } = await supabase.from('lists').select('id').eq('user_id', userId)
  if (e3) return { error: e3.message }
  const toDeleteLists =
    remoteListIds?.map((r) => r.id as string).filter((id) => !localListIds.has(id)) ?? []
  if (toDeleteLists.length > 0) {
    const { error: e4 } = await supabase.from('lists').delete().in('id', toDeleteLists)
    if (e4) return { error: e4.message }
  }

  return {}
}
