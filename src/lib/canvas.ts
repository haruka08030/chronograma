import { FunctionsHttpError } from '@supabase/supabase-js'
import type { Task } from '../types/task'
import type { TaskList } from '../types/list'
import type { ListSection } from '../types/section'
import { getSupabase } from './supabase'
import { wallInZone } from './timeZone'

/**
 * Canvas LMS 連携のクライアント側。Canvas API はブラウザから直接呼べない（CORS・トークン秘匿）ので、
 * すべて Edge Function `canvas` 経由にする。
 *
 * タスクの id は `canvas-<種類>-<ID>`、コースのセクションは `canvas-course-<コースID>` に決め打ちする。
 * 列を足さずに Canvas の課題と結び付けられ、別の端末で取り込んでも同じ行になる。
 */

export const CANVAS_LIST_ID = 'canvas-list'

const TASK_ID_RE = /^canvas-(assignment|quiz|discussion_topic|wiki_page|planner_note)-(\d+)$/

export type CanvasStatus =
  | { connected: false }
  | { connected: true; baseUrl: string; userName: string | null }

export type CanvasItem = {
  type: string
  id: string
  title: string
  courseId: string | null
  courseName: string | null
  url: string
  /** 締切（ISO 日時）。null は締切なし */
  dueAt: string | null
  /** 提出済み・採点済み・免除・Canvas で完了にした */
  done: boolean
}

export type CanvasItemsPayload =
  | { connected: false }
  | { connected: true; windowStart: string; windowEnd: string; items: CanvasItem[] }

/** サーバーが返すエラーコード。画面ではこれを訳して出す */
export class CanvasRequestError extends Error {
  code: string | null
  constructor(code: string | null, message: string) {
    super(message)
    this.code = code
  }
}

async function invokeCanvas<T>(body: Record<string, unknown>): Promise<T> {
  const sb = getSupabase()
  if (!sb) throw new CanvasRequestError(null, 'Supabase is not configured')
  const { data, error } = await sb.functions.invoke('canvas', { body })
  if (error) {
    let message = error.message
    if (error instanceof FunctionsHttpError) {
      try {
        const b = (await error.context.json()) as { error?: string; code?: string }
        if (b?.code) throw new CanvasRequestError(b.code, b.error ?? b.code)
        if (b?.error) message = b.error
      } catch (e) {
        if (e instanceof CanvasRequestError) throw e
      }
    }
    throw new CanvasRequestError(null, message)
  }
  const payload = (data ?? {}) as T & { ok?: boolean; code?: string; error?: string }
  if (payload.ok === false) {
    throw new CanvasRequestError(payload.code ?? null, payload.error ?? payload.code ?? 'Canvas request failed')
  }
  return payload
}

export const fetchCanvasStatus = () => invokeCanvas<CanvasStatus>({ action: 'status' })
/** `baseUrl` を省くと、つないであった URL のままトークンだけ貼り直す */
export const connectCanvas = (token: string, baseUrl?: string) =>
  invokeCanvas<CanvasStatus>({ action: 'connect', token, ...(baseUrl ? { baseUrl } : {}) })
export const disconnectCanvas = () => invokeCanvas<{ ok: true }>({ action: 'disconnect' })
export const fetchCanvasItems = () => invokeCanvas<CanvasItemsPayload>({ action: 'items' })
export const markCanvasComplete = (type: string, id: string, complete: boolean) =>
  invokeCanvas<{ ok: true }>({ action: 'complete', type, id, complete })

export function canvasTaskId(type: string, id: string): string {
  return `canvas-${type}-${id}`
}

export function parseCanvasTaskId(id: string): { type: string; id: string } | null {
  const m = TASK_ID_RE.exec(id)
  return m ? { type: m[1], id: m[2] } : null
}

export function canvasSectionId(courseId: string): string {
  return `canvas-course-${courseId}`
}

/** Canvas の締切（UTC の瞬間）を、アプリのタイムゾーンの期限日と締め切り時刻に */
export function canvasDue(dueAt: string | null, timeZone: string): { dueDate: string | null; dueTime: string | null } {
  const at = dueAt ? Date.parse(dueAt) : NaN
  if (Number.isNaN(at)) return { dueDate: null, dueTime: null }
  const wall = wallInZone(at, timeZone)
  return { dueDate: wall.date, dueTime: wall.time }
}

export type CanvasReconcileResult = {
  lists: TaskList[]
  sections: ListSection[]
  tasks: Task[]
  /** Canvas 側で済んだので自動で完了にしたタスク。Canvas へ書き戻さない */
  autoCompletedIds: string[]
  changed: boolean
}

/**
 * Canvas の課題を、Canvas 用リストのタスクに合わせる。
 * - 未提出で無いものは作る（コースごとのセクションに入れる）。未完了のものはタイトル・期限を Canvas に合わせる
 * - 提出済みなど Canvas で済んだものは、未完了なら完了にする（済んだものを新しく作りはしない）
 * - 取り込む期間の中なのに返ってこなくなった（削除・非公開になった）ものは完了にする
 * - 完了済み・アーカイブ・削除済みのタスクは生き返らせない。`skipIds`（書き戻し待ち）にも触らない
 */
export function reconcileCanvasItems(
  state: { lists: TaskList[]; sections: ListSection[]; tasks: Task[] },
  payload: { windowStart: string; windowEnd: string; items: CanvasItem[] },
  opts: { now: string; listName: string; listColor: string; timeZone: string; untitled: string; skipIds?: ReadonlySet<string> },
): CanvasReconcileResult {
  let changed = false
  let lists = state.lists
  if (!lists.some((l) => l.id === CANVAS_LIST_ID)) {
    const maxOrder = Math.max(0, ...lists.map((l) => l.order))
    lists = [...lists, { id: CANVAS_LIST_ID, name: opts.listName, color: opts.listColor, order: maxOrder + 1, kind: 'tasks', updatedAt: opts.now }]
    changed = true
  }

  let sections = state.sections
  const ensureSection = (courseId: string, name: string | null): string => {
    const id = canvasSectionId(courseId)
    if (!sections.some((s) => s.id === id)) {
      const maxOrder = Math.max(-1, ...sections.filter((s) => s.listId === CANVAS_LIST_ID).map((s) => s.order))
      sections = [...sections, { id, listId: CANVAS_LIST_ID, name: name || opts.untitled, order: maxOrder + 1, updatedAt: opts.now }]
    }
    return id
  }

  const skip = opts.skipIds ?? new Set<string>()
  const byId = new Map(state.tasks.map((t) => [t.id, t]))
  const seen = new Set<string>()
  const updates = new Map<string, Task>()
  const additions: Task[] = []
  const autoCompletedIds: string[] = []
  let nextOrder = Math.max(-1, ...state.tasks.filter((t) => t.listId === CANVAS_LIST_ID).map((t) => t.order)) + 1

  const complete = (t: Task) => {
    updates.set(t.id, { ...t, completed: true, completedAt: opts.now, updatedAt: opts.now })
    autoCompletedIds.push(t.id)
  }

  for (const item of payload.items) {
    const id = canvasTaskId(item.type, item.id)
    if (seen.has(id)) continue
    seen.add(id)
    const existing = byId.get(id)
    if (existing && (existing.completed || existing.archivedAt || existing.deletedAt || skip.has(id))) continue

    if (item.done) {
      if (existing) complete(existing)
      continue
    }

    const title = item.title || opts.untitled
    const { dueDate, dueTime } = canvasDue(item.dueAt, opts.timeZone)

    if (!existing) {
      additions.push({
        id,
        title,
        description: item.url,
        completed: false,
        completedAt: null,
        createdAt: opts.now,
        updatedAt: opts.now,
        order: nextOrder++,
        listId: CANVAS_LIST_ID,
        sectionId: item.courseId ? ensureSection(item.courseId, item.courseName) : null,
        parentId: null,
        dueDate,
        dueTime,
        scheduledDate: null,
        endDate: null,
        startTime: null,
        endTime: null,
        location: null,
        color: null,
        priority: 'none',
        tags: [],
        recurrence: null,
        isTimeLog: false,
        habitId: null,
        archivedAt: null,
        deletedAt: null,
      })
      continue
    }

    const patch: Partial<Task> = {}
    if (existing.title !== title) patch.title = title
    if (existing.dueDate !== dueDate || (existing.dueTime ?? null) !== dueTime) {
      patch.dueDate = dueDate
      patch.dueTime = dueTime
    }
    if (Object.keys(patch).length > 0) updates.set(id, { ...existing, ...patch, updatedAt: opts.now })
  }

  for (const t of state.tasks) {
    if (t.completed || t.archivedAt || t.deletedAt || seen.has(t.id) || skip.has(t.id)) continue
    if (!parseCanvasTaskId(t.id)) continue
    // 期間の外に出ただけのもの（出し忘れたまま 30 日たった課題など）は残す
    if (!t.dueDate || t.dueDate < payload.windowStart || t.dueDate > payload.windowEnd) continue
    complete(t)
  }

  if (sections !== state.sections) changed = true
  if (updates.size === 0 && additions.length === 0) {
    return { lists, sections, tasks: state.tasks, autoCompletedIds, changed }
  }
  return {
    lists,
    sections,
    tasks: [...state.tasks.map((t) => updates.get(t.id) ?? t), ...additions],
    autoCompletedIds,
    changed: true,
  }
}
