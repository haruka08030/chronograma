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
 * 学校（ホスト名）ごとに 1 つつなぎ、リストも学校ごとに分ける。id は接続 ID（ホスト名）を入れて決め打ちする:
 * リスト `canvas-list-<接続>`、セクション `canvas-course-<接続>-<コースID>`、タスク `canvas-<接続>-<種類>-<ID>`。
 * 列を足さずに Canvas の課題と結び付けられ、別の端末で取り込んでも同じ行になる。
 */

const TASK_ID_RE = /^canvas-([a-z0-9.-]+)-(assignment|quiz|discussion_topic|wiki_page|planner_note)-(\d+)$/

export type CanvasConnection = {
  id: string
  baseUrl: string
  userName: string | null
  /** トークンの期限（ISO）。null は期限なしか、分からない。サーバーが近づくたびに延ばす */
  expiresAt?: string | null
}

/** 延ばせなかったトークンの予告を出すのは、期限のこの日数前から */
const WARN_BEFORE_DAYS = 14

/** 期限が近い（自動で延ばせなかった）なら、その期限の Date。予告がいらなければ null */
export function canvasExpiryWarning(expiresAt: string | null | undefined, now: number = Date.now()): Date | null {
  const at = expiresAt ? Date.parse(expiresAt) : NaN
  if (Number.isNaN(at) || at - now > WARN_BEFORE_DAYS * 86_400_000) return null
  return new Date(at)
}

export type CanvasStatus = { connections: CanvasConnection[] }

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

export type CanvasConnectionItems = { id: string; windowStart: string; windowEnd: string; items: CanvasItem[] }

/** 学校ごとの結果。取れなかった学校は `error`（`canvas_unauthorized` など）だけ */
export type CanvasItemsPayload = {
  connections: Array<CanvasConnectionItems | { id: string; error: string }>
}

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
/** 新しくつなぐ（同じ学校ならつなぎ直し） */
export const connectCanvas = (token: string, baseUrl: string) =>
  invokeCanvas<CanvasStatus>({ action: 'connect', token, baseUrl })
/** つないであった学校のトークンだけ貼り直す */
export const renewCanvasToken = (connectionId: string, token: string) =>
  invokeCanvas<CanvasStatus>({ action: 'connect', token, connectionId })
export const disconnectCanvas = (connectionId: string) => invokeCanvas<CanvasStatus>({ action: 'disconnect', connectionId })
export const fetchCanvasItems = () => invokeCanvas<CanvasItemsPayload>({ action: 'items' })
export const markCanvasComplete = (connectionId: string, type: string, id: string, complete: boolean) =>
  invokeCanvas<{ ok: true }>({ action: 'complete', connectionId, type, id, complete })

export function canvasListId(connectionId: string): string {
  return `canvas-list-${connectionId}`
}

export function canvasTaskId(connectionId: string, type: string, id: string): string {
  return `canvas-${connectionId}-${type}-${id}`
}

export function parseCanvasTaskId(id: string): { connectionId: string; type: string; id: string } | null {
  const m = TASK_ID_RE.exec(id)
  return m ? { connectionId: m[1], type: m[2], id: m[3] } : null
}

export function canvasSectionId(connectionId: string, courseId: string): string {
  return `canvas-course-${connectionId}-${courseId}`
}

/** リスト名。1 校目は「Canvas」、2 校目からは学校が分かるようにホスト名の頭を添える */
export function canvasListName(connectionId: string, lists: { id: string }[]): string {
  const others = lists.some((l) => l.id.startsWith('canvas-list-') && l.id !== canvasListId(connectionId))
  return others ? `Canvas（${connectionId.split('.')[0]}）` : 'Canvas'
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
 * 1 校ぶんの Canvas の課題を、その学校のリストのタスクに合わせる。
 * - 未提出で無いものは作る（コースごとのセクションに入れる）。未完了のものはタイトル・期限を Canvas に合わせる
 * - 提出済みなど Canvas で済んだものは、未完了なら完了にする（済んだものを新しく作りはしない）
 * - 取り込む期間の中なのに返ってこなくなった（削除・非公開になった）ものは完了にする
 * - 完了済み・アーカイブ・削除済みのタスクは生き返らせない。`skipIds`（書き戻し待ち）にも触らない
 */
export function reconcileCanvasItems(
  state: { lists: TaskList[]; sections: ListSection[]; tasks: Task[] },
  payload: CanvasConnectionItems,
  opts: { now: string; listName: string; listColor: string; timeZone: string; untitled: string; skipIds?: ReadonlySet<string> },
): CanvasReconcileResult {
  const conn = payload.id
  const listId = canvasListId(conn)
  let changed = false
  let lists = state.lists
  if (!lists.some((l) => l.id === listId)) {
    const maxOrder = Math.max(0, ...lists.map((l) => l.order))
    lists = [...lists, { id: listId, name: opts.listName, color: opts.listColor, order: maxOrder + 1, kind: 'tasks', updatedAt: opts.now }]
    changed = true
  }

  let sections = state.sections
  const ensureSection = (courseId: string, name: string | null): string => {
    const id = canvasSectionId(conn, courseId)
    if (!sections.some((s) => s.id === id)) {
      const maxOrder = Math.max(-1, ...sections.filter((s) => s.listId === listId).map((s) => s.order))
      sections = [...sections, { id, listId, name: name || opts.untitled, order: maxOrder + 1, updatedAt: opts.now }]
    }
    return id
  }

  const skip = opts.skipIds ?? new Set<string>()
  const byId = new Map(state.tasks.map((t) => [t.id, t]))
  const seen = new Set<string>()
  const updates = new Map<string, Task>()
  const additions: Task[] = []
  const autoCompletedIds: string[] = []
  let nextOrder = Math.max(-1, ...state.tasks.filter((t) => t.listId === listId).map((t) => t.order)) + 1

  const complete = (t: Task) => {
    updates.set(t.id, { ...t, completed: true, completedAt: opts.now, updatedAt: opts.now })
    autoCompletedIds.push(t.id)
  }

  for (const item of payload.items) {
    const id = canvasTaskId(conn, item.type, item.id)
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
        listId,
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
    if (parseCanvasTaskId(t.id)?.connectionId !== conn) continue
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
