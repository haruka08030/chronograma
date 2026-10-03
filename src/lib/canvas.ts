import { FunctionsHttpError } from '@supabase/supabase-js'
import type { Task } from '../types/task'
import type { TaskList } from '../types/list'
import type { ListSection } from '../types/section'
import { getSupabase } from './supabase'
import { wallInZone } from './timeZone'
import { CANVAS_LIST_ID, isCanvasListId } from './canvasIds'
import { externalPatch, type PulledFields } from './externalFields'
import { TASK_DEFAULTS } from './taskDefaults'

/**
 * Canvas LMS 連携のクライアント側。Canvas API はブラウザから直接呼べない（CORS・トークン秘匿）ので、
 * すべて Edge Function `canvas` 経由にする。
 *
 * 学校（ホスト名）ごとに 1 つつなぐ。どの学校の課題も 1 つの「Canvas」リスト（`canvas-list`）に入れ、
 * 科目は入れ物（セクション）ではなく課題の属性なので、科目コードのタグ（`CSE-101` など）で一目で分かるようにする。
 * タスクの id は接続 ID（ホスト名）を入れて決め打ちする: `canvas-<接続>-<種類>-<ID>`。
 * 列を足さずに Canvas の課題と結び付けられ、別の端末で取り込んでも同じ行になる。
 */

export { CANVAS_LIST_ID }

const TASK_ID_RE = /^canvas-([a-z0-9.-]+)-(assignment|quiz|discussion_topic|wiki_page|planner_note)-(\d+)$/

export type CanvasConnection = {
  id: string
  /** 'token': アクセストークンで読み書き / 'ical': カレンダーフィードを読むだけ（完了は書き戻せない） */
  kind?: 'token' | 'ical'
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
  /** 終日の締切（`yyyy-MM-dd`）。カレンダーフィードの課題だけ。あれば `dueAt` より優先する */
  dueDate?: string
  /** 提出済み・採点済み・免除・Canvas で完了にした */
  done: boolean
}

export type CanvasConnectionItems = {
  id: string
  windowStart: string
  windowEnd: string
  /** カレンダーフィードでつないだ学校。完了を書き戻さない */
  readOnly?: boolean
  items: CanvasItem[]
}

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

/**
 * 学校ごとの一覧を必ず配列にする。古い関数（1 校だけの形 `{ connected, baseUrl }`）や
 * 空の応答でも、画面が `connections.length` で落ちないように
 */
export function withConnections<T extends { connections: unknown[] }>(payload: T): T {
  return { ...payload, connections: Array.isArray(payload?.connections) ? payload.connections : [] }
}

const invokeConnections = <T extends { connections: unknown[] }>(body: Record<string, unknown>) =>
  invokeCanvas<T>(body).then(withConnections)

export const fetchCanvasStatus = () => invokeConnections<CanvasStatus>({ action: 'status' })
/** 新しくつなぐ（同じ学校ならつなぎ直し） */
export const connectCanvas = (token: string, baseUrl: string) =>
  invokeConnections<CanvasStatus>({ action: 'connect', token, baseUrl })
/**
 * 貼られた URL がカレンダーフィード（`https://<学校>/feeds/calendars/….ics`）か。違えば理由を返す。
 * カレンダー画面そのもの（`/calendar#view_name=…`）を貼る間違いが多いので、それは分けて案内する
 */
export function canvasFeedUrlProblem(input: string): 'calendarPage' | 'notFeed' | null {
  const raw = input.trim()
  if (!raw) return null
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return 'notFeed'
  }
  if (/^\/feeds\/calendars\/[\w.-]+\.ics$/.test(url.pathname)) return null
  return url.pathname.startsWith('/calendar') ? 'calendarPage' : 'notFeed'
}

/** トークンを作れない学校は、カレンダーフィードの URL でつなぐ */
export const connectCanvasFeed = (feedUrl: string) => invokeConnections<CanvasStatus>({ action: 'connect', feedUrl })
/** つないであった学校のトークンだけ貼り直す */
export const renewCanvasToken = (connectionId: string, token: string) =>
  invokeConnections<CanvasStatus>({ action: 'connect', token, connectionId })
export const disconnectCanvas = (connectionId: string) =>
  invokeConnections<CanvasStatus>({ action: 'disconnect', connectionId })
export const fetchCanvasItems = () => invokeConnections<CanvasItemsPayload>({ action: 'items' })
export const markCanvasComplete = (connectionId: string, type: string, id: string, complete: boolean) =>
  invokeCanvas<{ ok: true }>({ action: 'complete', connectionId, type, id, complete })

export function canvasTaskId(connectionId: string, type: string, id: string): string {
  return `canvas-${connectionId}-${type}-${id}`
}

export function parseCanvasTaskId(id: string): { connectionId: string; type: string; id: string } | null {
  const m = TASK_ID_RE.exec(id)
  return m ? { connectionId: m[1], type: m[2], id: m[3] } : null
}

/** 以前の版が作っていた科目のセクションの id（`canvasCourseSectionsToTags` でタグに移す） */
export function canvasSectionId(connectionId: string, courseId: string): string {
  return `canvas-course-${connectionId}-${courseId}`
}

/**
 * 学校ごとに分かれていた Canvas のリストを 1 つにまとめる。タスクとセクションを `canvas-list` へ移し、古いリストは消す。
 * 名前と色は、一覧で上にある古いリストのものを引き継ぐ（変えた名前を戻さない）。
 */
export function mergeCanvasLists(
  state: { lists: TaskList[]; sections: ListSection[]; tasks: Task[] },
  now: string,
): { lists: TaskList[]; sections: ListSection[]; tasks: Task[]; mergedIds: string[] } | null {
  const old = state.lists.filter((l) => l.id !== CANVAS_LIST_ID && isCanvasListId(l.id)).sort((a, b) => a.order - b.order)
  if (old.length === 0) return null
  const oldIds = new Set(old.map((l) => l.id))
  const lists = state.lists.filter((l) => !oldIds.has(l.id))
  if (!lists.some((l) => l.id === CANVAS_LIST_ID)) {
    lists.push({ ...old[0], id: CANVAS_LIST_ID, updatedAt: now })
  }

  // セクションは古いリストの並びのまま、後ろに続ける
  let nextOrder = Math.max(-1, ...state.sections.filter((s) => s.listId === CANVAS_LIST_ID).map((s) => s.order)) + 1
  const sectionOrder = new Map<string, number>()
  for (const list of old) {
    for (const sec of state.sections.filter((s) => s.listId === list.id).sort((a, b) => a.order - b.order)) {
      sectionOrder.set(sec.id, nextOrder++)
    }
  }
  const sections = state.sections.map((s) =>
    oldIds.has(s.listId) ? { ...s, listId: CANVAS_LIST_ID, order: sectionOrder.get(s.id) ?? s.order, updatedAt: now } : s,
  )
  const tasks = state.tasks.map((t) => (oldIds.has(t.listId) ? { ...t, listId: CANVAS_LIST_ID, updatedAt: now } : t))
  return { lists, sections, tasks, mergedIds: [...oldIds] }
}

/** Canvas の締切（UTC の瞬間）を、アプリのタイムゾーンの期限日と締め切り時刻に */
export function canvasDue(dueAt: string | null, timeZone: string): { dueDate: string | null; dueTime: string | null } {
  const at = dueAt ? Date.parse(dueAt) : NaN
  if (Number.isNaN(at)) return { dueDate: null, dueTime: null }
  const wall = wallInZone(at, timeZone)
  return { dueDate: wall.date, dueTime: wall.time }
}

/** 科目のセクションの id（学校名入りと、最初の版の `canvas-course-<ID>` の両方） */
const COURSE_SECTION_RE = /^canvas-course-/

/**
 * 以前の版が科目ごとに作ったセクションを、科目のタグに移す。中のタスクにセクション名のタグを付けてセクションの外へ出し、
 * セクションを消す（別のリストへ移していたものも）。移したら `converted` が true（「タグを使う」を一度だけオンにする合図）。
 */
export function canvasCourseSectionsToTags(
  state: { sections: ListSection[]; tasks: Task[] },
  now: string,
): { sections: ListSection[]; tasks: Task[]; converted: boolean } {
  const course = new Map(state.sections.filter((s) => COURSE_SECTION_RE.test(s.id)).map((s) => [s.id, s.name]))
  if (course.size === 0) return { sections: state.sections, tasks: state.tasks, converted: false }
  const tasks = state.tasks.map((t) => {
    const name = t.sectionId ? course.get(t.sectionId) : undefined
    if (name === undefined) return t
    const tags = name && !t.tags.includes(name) ? [...t.tags, name] : t.tags
    return { ...t, sectionId: null, tags, updatedAt: now }
  })
  return { sections: state.sections.filter((s) => !course.has(s.id)), tasks, converted: true }
}

export type CanvasReconcileResult = {
  lists: TaskList[]
  sections: ListSection[]
  tasks: Task[]
  /** Canvas 側で済んだので自動で完了にしたタスク。Canvas へ書き戻さない */
  autoCompletedIds: string[]
  /** 今回の取り込みのあとに覚えておく値（`opts.pulled` を渡したとき） */
  pulled: Record<string, PulledFields>
  changed: boolean
}

/**
 * 1 校ぶんの Canvas の課題を、Canvas のリストのタスクに合わせる。
 * - 未提出で無いものは作る（科目コードのタグを付ける）。未完了のものはタイトル・期限を Canvas に合わせる
 * - 提出済みなど Canvas で済んだものは、未完了なら完了にする（済んだものを新しく作りはしない）
 * - 取り込む期間の中なのに返ってこなくなった（削除・非公開になった）ものは完了にする
 * - 完了済み・アーカイブ・削除済みのタスクは生き返らせない。`skipIds`（書き戻し待ち）にも触らない
 */
export function reconcileCanvasItems(
  state: { lists: TaskList[]; sections: ListSection[]; tasks: Task[] },
  payload: CanvasConnectionItems,
  opts: {
    now: string
    listName: string
    listColor: string
    timeZone: string
    untitled: string
    skipIds?: ReadonlySet<string>
    /**
     * 前回取り込んだ値。渡すと、ユーザーが変えたタイトル・期限は Canvas の値で上書きしない
     * （手元の値が前回取り込んだ値と同じとき＝変えていないときだけ、Canvas の新しい値にする）
     */
    pulled?: Readonly<Record<string, PulledFields>>
  },
): CanvasReconcileResult {
  const conn = payload.id
  const listId = CANVAS_LIST_ID
  let changed = false
  let lists = state.lists
  if (!lists.some((l) => l.id === listId)) {
    const maxOrder = Math.max(0, ...lists.map((l) => l.order))
    lists = [...lists, { id: listId, name: opts.listName, color: opts.listColor, order: maxOrder + 1, kind: 'tasks', updatedAt: opts.now }]
    changed = true
  }

  const sections = state.sections

  const skip = opts.skipIds ?? new Set<string>()
  const byId = new Map(state.tasks.map((t) => [t.id, t]))
  const seen = new Set<string>()
  const updates = new Map<string, Task>()
  const additions: Task[] = []
  const autoCompletedIds: string[] = []
  const pulled: Record<string, PulledFields> = { ...(opts.pulled ?? {}) }
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
    const { dueDate, dueTime } = item.dueDate ? { dueDate: item.dueDate, dueTime: null } : canvasDue(item.dueAt, opts.timeZone)

    if (!existing) {
      pulled[id] = { title, dueDate, dueTime }
      additions.push({
        ...TASK_DEFAULTS,
        id,
        title,
        description: item.url,
        completed: false,
        completedAt: null,
        createdAt: opts.now,
        updatedAt: opts.now,
        order: nextOrder++,
        listId,
        sectionId: null,
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
        tags: item.courseName ? [item.courseName] : [],
        recurrence: null,
        isTimeLog: false,
        habitId: null,
        archivedAt: null,
        deletedAt: null,
      })
      continue
    }

    // ユーザーが手元で変えたタイトル・期限は上書きしない（externalPatch）
    const patch = externalPatch(existing, { title, dueDate, dueTime }, opts.pulled?.[id], { remember: Boolean(opts.pulled) })
    pulled[id] = { title, dueDate, dueTime }
    if (Object.keys(patch).length > 0) updates.set(id, { ...existing, ...patch, updatedAt: opts.now })
  }

  for (const t of state.tasks) {
    if (t.completed || t.archivedAt || t.deletedAt || seen.has(t.id) || skip.has(t.id)) continue
    if (parseCanvasTaskId(t.id)?.connectionId !== conn) continue
    // 期間の外に出ただけのもの（出し忘れたまま 30 日たった課題など）は残す
    if (!t.dueDate || t.dueDate < payload.windowStart || t.dueDate > payload.windowEnd) continue
    complete(t)
  }

  if (updates.size === 0 && additions.length === 0) {
    return { lists, sections, tasks: state.tasks, autoCompletedIds, pulled, changed }
  }
  return {
    lists,
    sections,
    tasks: [...state.tasks.map((t) => updates.get(t.id) ?? t), ...additions],
    autoCompletedIds,
    pulled,
    changed: true,
  }
}
