/**
 * 「予定 N 件中 M 件・予定外」の数え方の例。アプリ（見出し・週のふりかえり・タブの通知）とサーバー（夜のまとめ・朝のまとめの「昨日」）の
 * テストで同じ例を使い、同じ数になることを確かめる
 */
import { taskKindFlags, type Task } from '../types/task'
import type { Habit } from '../types/habit'
import { TASK_DEFAULTS } from '../lib/taskDefaults'
import type { WrapUpHabitRow, WrapUpRow } from '../../supabase/functions/daily-reminders/wrapUp'

/** 例の日（木曜） */
export const EXAMPLE_DAY = '2026-10-08'

export const exampleTask = (id: string, over: Partial<Task> = {}): Task =>
  ({
    ...TASK_DEFAULTS,
    id,
    title: id,
    description: '',
    completed: false,
    completedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    order: 0,
    listId: 'inbox',
    sectionId: null,
    parentId: null,
    dueDate: null,
    startTime: null,
    endTime: null,
    priority: 'none',
    tags: [],
    recurrence: null,
    ...over,
  }) as Task

export const exampleHabit = (id: string, over: Partial<Habit> = {}): Habit => ({
  id,
  title: id,
  color: '#f97316',
  timeMode: 'none',
  startTime: null,
  endTime: null,
  frequency: { type: 'daily' },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  completedDates: [],
  archivedAt: null,
  ...over,
})

/** いつかのリスト（数えない） */
export const EXAMPLE_EXCLUDED = new Set(['someday-list'])

const D = EXAMPLE_DAY

/**
 * 例の 1 日。数えるのは es・gym・read・moved（その日から移した予定）・run（習慣の枠）の 5 件。
 * そのうち es（▶ で始めた記録）・gym（✓ で終えた）・run（習慣の記録）の 3 件が予定どおり。予定外は game の 60 分。
 * 授業（予定）は数えず、その時間の記録も予定外にしない
 */
export function exampleTasks(): Task[] {
  return [
    exampleTask('es', { scheduledDate: D, startTime: '10:00', endTime: '11:00' }),
    exampleTask('esLog', { kind: 'log', title: 'ES を書く', sourceTaskId: 'es', dueDate: D, startTime: '10:05', endTime: '11:00' }),
    exampleTask('gym', { scheduledDate: D, startTime: '18:00', endTime: '19:00', completed: true, completedAt: '2026-10-08T10:00:00Z' }),
    exampleTask('read', { scheduledDate: D, startTime: '20:00', endTime: '21:00' }),
    exampleTask('moved', {
      scheduledDate: '2026-10-10',
      startTime: '14:00',
      endTime: '15:00',
      movedPlans: [{ date: D, startTime: '14:00', endTime: '15:00', to: '2026-10-10' }],
    }),
    exampleTask('class', { kind: 'event', title: '統計学', scheduledDate: D, startTime: '13:00', endTime: '14:30' }),
    exampleTask('classLog', { kind: 'log', title: '統計学', dueDate: D, startTime: '13:00', endTime: '14:30' }),
    exampleTask('game', { kind: 'log', title: 'ゲーム', dueDate: D, startTime: '21:00', endTime: '22:00' }),
    exampleTask('runLog', { kind: 'log', title: 'run', habitId: 'run', dueDate: D, startTime: '07:00', endTime: '07:30' }),
    // 数えないもの: 時間の無い To-Do・サブタスク・いつかのリスト・消した記録・睡眠
    exampleTask('untimed', { scheduledDate: D }),
    exampleTask('sub', { parentId: 'es', scheduledDate: D, startTime: '11:00', endTime: '11:30' }),
    exampleTask('someday', { listId: 'someday-list', scheduledDate: D, startTime: '15:00', endTime: '16:00' }),
    exampleTask('trashLog', {
      kind: 'log',
      title: '散歩',
      dueDate: D,
      startTime: '16:00',
      endTime: '17:00',
      deletedAt: '2026-10-08T09:00:00Z',
    }),
    exampleTask('sleep', { kind: 'sleep', title: '睡眠', dueDate: D, startTime: '00:30', endTime: '06:30' }),
  ]
}

export function exampleHabits(): Habit[] {
  return [
    exampleHabit('run', { timeMode: 'range', startTime: '07:00', endTime: '07:30' }),
    // 週に◯回で、その日にやっていない → 数えない
    exampleHabit('stretch', { timeMode: 'fixed', startTime: '22:30', frequency: { type: 'timesPerWeek', count: 3 } }),
    // 月曜だけ → 木曜には無い
    exampleHabit('yoga', { timeMode: 'range', startTime: '06:00', endTime: '06:30', frequency: { type: 'weekly', weekdays: [1] } }),
    // 時間を決めていない習慣は枠が無い
    exampleHabit('water'),
  ]
}

/** 例の日の数（過ぎた日として見たとき） */
export const EXAMPLE_RESULT = { planned: 5, followed: 3, unplannedMinutes: 60, loggedMinutes: 30 + 55 + 90 + 60 }

/** アプリのタスクを DB の行に（同期で書く列と同じ名前） */
export function toWrapUpRow(t: Task): WrapUpRow {
  const flags = taskKindFlags(t.kind ?? 'todo')
  return {
    id: t.id,
    list_id: t.listId,
    title: t.title,
    parent_id: t.parentId,
    is_time_log: flags.isTimeLog,
    is_sleep: flags.isSleep,
    is_event: flags.isEvent,
    completed: t.completed,
    scheduled_date: t.scheduledDate ?? null,
    due_date: t.dueDate,
    start_time: t.startTime,
    end_time: t.endTime,
    end_date: t.endDate ?? null,
    source_task_id: t.sourceTaskId ?? null,
    habit_id: t.habitId ?? null,
    moved_plans: t.movedPlans ?? null,
    deleted_at: t.deletedAt ?? null,
    archived_at: t.archivedAt ?? null,
  }
}

/** アプリの習慣を DB の行に */
export function toWrapUpHabitRow(h: Habit): WrapUpHabitRow {
  return {
    id: h.id,
    title: h.title,
    time_mode: h.timeMode,
    start_time: h.startTime,
    end_time: h.endTime,
    frequency: h.frequency,
    completed_dates: h.completedDates,
    time_overrides: h.timeOverrides ?? null,
    weekday_times: h.weekdayTimes ?? null,
    rest_dates: h.restDates ?? null,
    goal_minutes: h.goalMinutes ?? null,
    archived_at: h.archivedAt,
    deleted_at: h.deletedAt ?? null,
  }
}
