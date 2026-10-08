/**
 * ストアの操作が使う純粋な関数（localStorage・i18n を読まない）。
 * 文言（色の名前など）や「今」は呼ぶ側から渡す
 */
import { isLogTask, type Task, type TaskKind } from '../types/task'
import { newId } from '../lib/id'
import { inferLogCategory } from '../lib/logCategory'
import { categoryHex, type LogLabel } from '../lib/logCategoryColors'
import { appTimeZone } from '../lib/timeZone'
import { looksLikeSleep } from '../lib/sleep'
import { INBOX_ID } from './storeConstants'
import type { TaskState } from './storeTypes'
import { withLogCategory } from '../lib/taskDefaults'
import { sameValue } from '../lib/sameValue'
import { compareByOrder } from '../lib/orderCompare'

/** `updateTask` で書き換えられる列 */

export type TaskPatch = Parameters<TaskState['updateTask']>[1]

/** 子孫（任意の深さ）を含む。一括削除・リスト移動で親子の整合を取る */
/** `nodeId` の祖先チェーンに `possibleAncestorId` が現れるか（自身含む） */
export function isAncestorInChain(tasks: Task[], possibleAncestorId: string, nodeId: string): boolean {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  let cur: string | null = nodeId
  for (let i = 0; i < 10_000 && cur; i++) {
    if (cur === possibleAncestorId) return true
    cur = byId.get(cur)?.parentId ?? null
  }
  return false
}

export function siblingIdsOrdered(tasks: Task[], parentId: string | null, excludeTaskId?: string): string[] {
  return tasks
    .filter((t) => t.parentId === parentId && (!excludeTaskId || t.id !== excludeTaskId))
    .sort(compareByOrder)
    .map((t) => t.id)
}

export function expandDescendantIds(rootIds: Iterable<string>, allTasks: Task[]): Set<string> {
  const out = new Set(rootIds)
  let added = true
  while (added) {
    added = false
    for (const t of allTasks) {
      if (t.parentId && out.has(t.parentId) && !out.has(t.id)) {
        out.add(t.id)
        added = true
      }
    }
  }
  return out
}

export function applyTaskPatch(task: Task, patch: TaskPatch, now: string = new Date().toISOString()): Task {
  const applied = { ...task, ...patch, updatedAt: now }
  // 日付・時刻の列はいつもアプリのタイムゾーンで書く（`taskTimeZone.ts`）
  if (patch.timeZone !== undefined) applied.timeZoneAnchor = appTimeZone()
  if (patch.completed === true) {
    if (!task.completed) {
      applied.completedAt = typeof patch.completedAt === 'string' ? patch.completedAt : now
    } else if (patch.completedAt !== undefined) {
      applied.completedAt = patch.completedAt
    }
  } else if (patch.completed === false) {
    applied.completedAt = null
  } else if (patch.completedAt !== undefined) {
    applied.completedAt = patch.completedAt
  }
  if (patch.listId !== undefined && patch.listId !== task.listId) {
    applied.sectionId = null
  }
  // 記録の分類は category が正。前の書き方（tags の先頭）で来た分類も category にする
  if (isLogTask(task) && patch.tags !== undefined && patch.category === undefined) applied.category = patch.tags[0] ?? null
  // 色＝分類: 記録の分類を選び直したら、Google から写した色より分類の色を優先する
  if (isLogTask(task) && patch.color === undefined && applied.category && applied.category !== task.category) {
    applied.color = null
  }
  // 予定にしたら、To-Do だけの項目（締切・繰り返し・完了・優先度）を外す（予定は締切・完了を持たない）
  if (patch.kind === 'event' && task.kind !== 'event') {
    Object.assign(applied, { dueDate: null, dueTime: null, recurrence: null, completed: false, completedAt: null, priority: 'none' })
  }
  // 期限（dueDate）を外したら締め切り時刻と繰り返しもクリア（予定の時間幅は予定日側に紐づくので残す）
  if (patch.dueDate === null) {
    applied.dueTime = null
    applied.recurrence = null
  }
  // 予定日（scheduledDate）を外したら予定の時間幅もクリア
  if (patch.scheduledDate === null) {
    applied.startTime = null
    applied.endTime = null
  }
  return withLogCategory(applied)
}

/**
 * パッチを当てると何か変わるか（`updatedAt` は除く）。同じ値を選び直しただけなら false。
 * 取り消しの履歴・トースト・同期の書き込みを、何も変えない操作で積まないために使う
 */
export function patchChangesTask(task: Task, patch: TaskPatch): boolean {
  const applied = applyTaskPatch(task, patch, task.updatedAt) as unknown as Record<string, unknown>
  const before = task as unknown as Record<string, unknown>
  const keys = new Set([...Object.keys(before), ...Object.keys(applied)])
  for (const k of keys) {
    if (k === 'updatedAt') continue
    if (!sameValue(before[k], applied[k])) return true
  }
  return false
}

export function orderForNewSiblingAtFront(tasks: Task[], listId: string, parentId: string | null, sectionId: string | null = null): number {
  const siblings = tasks.filter((t) => {
    if (t.listId !== listId || t.parentId !== parentId) return false
    if (parentId !== null) return true
    return t.sectionId === (sectionId ?? null)
  })
  if (siblings.length === 0) return 0
  return Math.min(...siblings.map((t) => t.order)) - 1
}

export function makeTask(
  fields: {
    title: string
    listId: string
    sectionId?: string | null
    dueDate?: string | null
    dueTime?: string | null
    scheduledDate?: string | null
    endDate?: string | null
    startTime?: string | null
    endTime?: string | null
    /** 無ければ To-Do */
    kind?: TaskKind
    completed?: boolean
    tags?: string[]
    color?: string | null
    habitId?: string | null
    estimateMinutes?: number | null
    sourceTaskId?: string | null
  },
  order: number,
  now: string = new Date().toISOString(),
): Task {
  const task: Task = {
    id: newId(),
    title: fields.title,
    description: '',
    completed: fields.completed ?? false,
    completedAt: fields.completed === true ? now : null,
    createdAt: now,
    updatedAt: now,
    order,
    listId: fields.listId,
    sectionId: fields.sectionId ?? null,
    parentId: null,
    dueDate: fields.dueDate ?? null,
    dueTime: fields.dueTime ?? null,
    scheduledDate: fields.scheduledDate ?? null,
    endDate: fields.endDate ?? null,
    startTime: fields.startTime ?? null,
    endTime: fields.endTime ?? null,
    location: null,
    estimateMinutes: fields.estimateMinutes ?? null,
    color: fields.color ?? null,
    priority: 'none',
    tags: fields.tags ?? [],
    recurrence: null,
    kind: fields.kind ?? 'todo',
    habitId: fields.habitId ?? null,
    sourceTaskId: fields.sourceTaskId ?? null,
    archivedAt: null,
    deletedAt: null,
    timeZone: null,
    reminders: null,
    category: null,
    // 列を書いたタイムゾーン。アプリのタイムゾーンを変えたら同じ瞬間のまま書き直す（`taskTimeZone.ts`）
    timeZoneAnchor: appTimeZone(),
  }
  // 「睡眠」と付けた記録（後から記録・タイマー）も睡眠として扱う
  return withLogCategory(looksLikeSleep(task) ? { ...task, kind: 'sleep' } : task)
}

/** 記録の分類を推定するのに使う状態 */
export type CategoryInferenceState = Pick<TaskState, 'tasks' | 'timeLogTagPresets' | 'logCategoryColors'>

/**
 * 分類が空なら推定で補う（`inferLogCategory`: 元タスク → 同じタイトル → 似たタイトル → Google の色 → 分類名）。
 * `colorNames` は色の名前（表示言語の「トマト」など）。分類名が色の名前だけのときは推定に使わない
 */
export function inferCategoryTags(
  tags: string[],
  state: CategoryInferenceState,
  title: string,
  colorNames: ReadonlySet<string>,
  opts: { taskId?: string | null; colorHex?: string | null } = {},
): string[] {
  if (tags.length > 0) return tags
  const inferred = inferLogCategory(state.tasks, title, {
    sourceTaskId: opts.taskId,
    colorHex: opts.colorHex,
    categoryHexes: state.timeLogTagPresets.map((n) => [n, categoryHex(n, state.logCategoryColors)] as const),
    colorNames,
  })
  return inferred ? [inferred] : []
}

/** 予定から作る記録（完了した時間ログ） */
export function completedRecordPatch(
  s: CategoryInferenceState,
  fields: {
    title: string
    dueDate: string
    startTime: string
    endTime: string
    color?: string | null
    habitId?: string | null
    /** 決まっているラベル（習慣の色）。あれば推定しない */
    label?: LogLabel
  },
  colorNames: ReadonlySet<string>,
  now: string = new Date().toISOString(),
): Pick<TaskState, 'tasks'> {
  const { title, dueDate, startTime, endTime, habitId, label } = fields
  const color = label ? label.color : fields.color
  const maxOrder = Math.max(0, ...s.tasks.map((t) => t.order))
  const tags = label ? label.tags : inferCategoryTags([], s, title, colorNames, { colorHex: color })
  return {
    tasks: [
      ...s.tasks,
      makeTask(
        {
          title,
          listId: INBOX_ID,
          dueDate,
          startTime,
          endTime,
          kind: 'log',
          completed: true,
          tags,
          // 色＝ラベル。ラベルが決まればその色で描き、決まらないときは Google の色をそのまま残す（名前の無い色）
          color: tags.length > 0 ? null : (color ?? null),
          habitId: habitId ?? null,
        },
        maxOrder + 1,
        now,
      ),
    ],
  }
}
