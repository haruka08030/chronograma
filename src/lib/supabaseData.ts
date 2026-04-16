import type { SupabaseClient } from '@supabase/supabase-js'
import type { Task } from '../types/task'
import type { TaskList } from '../types/list'
import type { Habit, HabitWeekday } from '../types/habit'
import { INBOX_LIST_ID } from '../store/taskStore'

interface ListRow {
  id: string
  user_id: string
  name: string
  color: string
  sort_order: number
  updated_at: string
}

interface HabitRow {
  id: string
  user_id: string
  title: string
  color: string
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
  title: string
  description: string
  completed: boolean
  created_at: string
  updated_at: string
  sort_order: number
  due_date: string | null
  start_time: string | null
  end_time: string | null
  priority: string
  tags: unknown
  recurrence: unknown
  is_time_log: boolean
}

function rowToList(row: ListRow): TaskList {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    order: row.sort_order,
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
  return {
    id: row.id,
    title: row.title,
    color: row.color,
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
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    completed: row.completed,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    order: row.sort_order,
    listId: row.list_id,
    parentId: row.parent_id,
    dueDate: row.due_date,
    startTime: row.start_time,
    endTime: row.end_time,
    priority,
    tags,
    recurrence,
    isTimeLog: row.is_time_log,
  }
}

function listToRow(userId: string, list: TaskList): ListRow {
  return {
    id: list.id,
    user_id: userId,
    name: list.name,
    color: list.color,
    sort_order: list.order,
    updated_at: new Date().toISOString(),
  }
}

function taskToRow(userId: string, task: Task): TaskRow {
  return {
    id: task.id,
    user_id: userId,
    list_id: task.listId,
    parent_id: task.parentId,
    title: task.title,
    description: task.description,
    completed: task.completed,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
    sort_order: task.order,
    due_date: task.dueDate,
    start_time: task.startTime,
    end_time: task.endTime,
    priority: task.priority,
    tags: task.tags,
    recurrence: task.recurrence,
    is_time_log: task.isTimeLog ?? false,
  }
}

export async function fetchListsTasksHabits(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ lists: TaskList[]; tasks: Task[]; habits: Habit[] } | { error: string }> {
  const { data: listRows, error: e1 } = await supabase
    .from('lists')
    .select('*')
    .eq('user_id', userId)

  if (e1) return { error: e1.message }

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
  const tasks = ((taskRows ?? []) as TaskRow[]).map(rowToTask)
  const habits = ((habitRows ?? []) as HabitRow[]).map(rowToHabit)
  return { lists, tasks, habits }
}

/** Remote is only default inbox and no tasks (and no extra lists / habits). */
function isTrivialRemote(lists: TaskList[], tasks: Task[], habits: Habit[]): boolean {
  if (tasks.length > 0 || habits.length > 0) return false
  const nonInbox = lists.filter((l) => l.id !== INBOX_LIST_ID)
  return nonInbox.length === 0
}

export type HydrateDecision =
  | { kind: 'use_remote'; lists: TaskList[]; tasks: Task[]; habits: Habit[] }
  | { kind: 'push_local' }

/** Decide first sync: upload local-only data vs replace with server snapshot. */
export function decideHydrate(
  remoteLists: TaskList[],
  remoteTasks: Task[],
  remoteHabits: Habit[],
  localLists: TaskList[],
  localTasks: Task[],
  localHabits: Habit[],
): HydrateDecision {
  if (remoteLists.length === 0 && remoteTasks.length === 0 && remoteHabits.length === 0) {
    return { kind: 'push_local' }
  }
  if (isTrivialRemote(remoteLists, remoteTasks, remoteHabits)) {
    const localHasData =
      localTasks.length > 0
      || localHabits.length > 0
      || localLists.filter((l) => l.id !== INBOX_LIST_ID).length > 0
    if (localHasData) return { kind: 'push_local' }
  }
  return { kind: 'use_remote', lists: remoteLists, tasks: remoteTasks, habits: remoteHabits }
}

export async function pushListsTasksHabits(
  supabase: SupabaseClient,
  userId: string,
  lists: TaskList[],
  tasks: Task[],
  habits: Habit[],
): Promise<{ error?: string }> {
  const listRows = lists.map((l) => listToRow(userId, l))
  const taskRows = tasks.map((t) => taskToRow(userId, t))
  const habitRows = habits.map((h) => habitToRow(userId, h))

  const { error: e1 } = await supabase.from('lists').upsert(listRows, { onConflict: 'id' })
  if (e1) return { error: e1.message }

  const { error: e2 } = await supabase.from('tasks').upsert(taskRows, { onConflict: 'id' })
  if (e2) return { error: e2.message }

  const { error: eH } = await supabase.from('habits').upsert(habitRows, { onConflict: 'id' })
  if (eH) return { error: eH.message }

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
