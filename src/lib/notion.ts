import { FunctionsHttpError } from '@supabase/supabase-js'
import type { Task } from '../types/task'
import type { TaskList } from '../types/list'
import { getSupabase, sendFunctionOnLeave } from './supabase'
import { externalPatch, type PulledFields } from './externalFields'
import { TASK_DEFAULTS } from './taskDefaults'

/**
 * Notion 連携のクライアント側。Notion API はブラウザから直接呼べない（CORS・トークン秘匿）ので、
 * すべて Edge Function `notion` 経由にする。
 *
 * タスクの id は `notion-<ページID>-<ステータス>` に決め打ちする。列を足さずに Notion の行と結び付けられ、
 * 「ES を出す → 面接を受ける」のようにステータスが進むと別のタスクになるので、済んだ段階は記録として残る。
 */

export const NOTION_LIST_ID = 'notion-list'

export type NotionConfig = {
  statusProperty: string | null
  dateProperty: string | null
  actionStatuses: string[]
  nextStatus: Record<string, string>
}

export type NotionSchemaProperty = { name: string; type: string; options?: string[] }

export type NotionStatus =
  | { connected: false }
  | {
      connected: true
      databaseId: string
      databaseTitle: string
      properties: NotionSchemaProperty[]
      config: NotionConfig
    }

export type NotionPage = {
  pageId: string
  url: string
  title: string
  status: string
  /** Notion の日付（`yyyy-MM-dd` か ISO 日時）。null は空欄 */
  date: string | null
}

export type NotionPagesPayload =
  | { connected: false }
  | {
      connected: true
      configured: boolean
      databaseTitle: string
      datesEnabled?: boolean
      pages: NotionPage[]
    }

/** サーバーが返すエラーコード。画面ではこれを訳して出す */
export class NotionRequestError extends Error {
  code: string | null
  constructor(code: string | null, message: string) {
    super(message)
    this.code = code
  }
}

async function invokeNotion<T>(body: Record<string, unknown>): Promise<T> {
  const sb = getSupabase()
  if (!sb) throw new NotionRequestError(null, 'Supabase is not configured')
  const { data, error } = await sb.functions.invoke('notion', { body })
  if (error) {
    let message = error.message
    if (error instanceof FunctionsHttpError) {
      try {
        const b = (await error.context.json()) as { error?: string; code?: string }
        if (b?.code) throw new NotionRequestError(b.code, b.error ?? b.code)
        if (b?.error) message = b.error
      } catch (e) {
        if (e instanceof NotionRequestError) throw e
      }
    }
    throw new NotionRequestError(null, message)
  }
  const payload = (data ?? {}) as T & { ok?: boolean; code?: string; error?: string }
  if (payload.ok === false) {
    throw new NotionRequestError(payload.code ?? null, payload.error ?? payload.code ?? 'Notion request failed')
  }
  return payload
}

export const fetchNotionStatus = () => invokeNotion<NotionStatus>({ action: 'status' })
export const connectNotion = (token: string, database: string) =>
  invokeNotion<NotionStatus>({ action: 'connect', token, database })
export const saveNotionConfig = (config: NotionConfig) => invokeNotion<NotionStatus>({ action: 'config', config })
export const disconnectNotion = () => invokeNotion<{ ok: true }>({ action: 'disconnect' })
export const fetchNotionPages = () => invokeNotion<NotionPagesPayload>({ action: 'pages' })
export const advanceNotionPage = (pageId: string, fromStatus: string) =>
  invokeNotion<{ advanced: boolean; to?: string }>({ action: 'advance', pageId, fromStatus })

/** タブを閉じるときの `advanceNotionPage`。応答は待たない */
export const advanceNotionPageOnLeave = (pageId: string, fromStatus: string, accessToken: string) =>
  sendFunctionOnLeave('notion', { action: 'advance', pageId, fromStatus }, accessToken)

function toBase64Url(text: string): string {
  let bin = ''
  for (const byte of new TextEncoder().encode(text)) bin += String.fromCharCode(byte)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): string | null {
  try {
    const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
  } catch {
    return null
  }
}

/** ステータスは日本語なので base64url にして id に使える文字だけにする */
export function notionTaskId(pageId: string, status: string): string {
  return `notion-${pageId.replace(/-/g, '').toLowerCase()}-${toBase64Url(status)}`
}

export function parseNotionTaskId(id: string): { pageId: string; status: string } | null {
  const m = /^notion-([0-9a-f]{32})-([A-Za-z0-9_-]+)$/.exec(id)
  if (!m) return null
  const status = fromBase64Url(m[2])
  return status === null ? null : { pageId: m[1], status }
}

/** Notion の日付を期限に。時刻付き（`2026-10-03T14:00:00.000+09:00`）なら締め切り時刻にもする */
export function splitNotionDate(date: string | null): { dueDate: string | null; dueTime: string | null } {
  if (!date) return { dueDate: null, dueTime: null }
  const dueDate = date.slice(0, 10)
  const time = /T(\d{2}:\d{2})/.exec(date)
  return { dueDate, dueTime: time ? time[1] : null }
}

export type NotionReconcileResult = {
  lists: TaskList[]
  tasks: Task[]
  /** Notion 側でステータスが動いたので自動で完了にしたタスク。Notion へ書き戻さない */
  autoCompletedIds: string[]
  /** 今回の取り込みのあとに覚えておく値 */
  pulled: Record<string, PulledFields>
  changed: boolean
}

/**
 * Notion の「要アクション」の行を、Notion 用リストのタスクに合わせる。
 * - 無いものは作る。未完了のものはタイトル・期限を Notion に合わせる
 * - 未完了なのに Notion で要アクションでなくなったものは完了にする
 * - 完了済み・アーカイブ・削除済みのタスクには触らない（自分で片付けたものを生き返らせない）
 */
export function reconcileNotionPages(
  state: { lists: TaskList[]; tasks: Task[] },
  payload: { databaseTitle: string; datesEnabled?: boolean; pages: NotionPage[] },
  opts: {
    now: string
    listColor: string
    titleFor: (page: NotionPage) => string
    /** 前回取り込んだ値。渡すと、ユーザーが変えたタイトル・期限は上書きしない（`externalPatch`） */
    pulled?: Readonly<Record<string, PulledFields>>
  },
): NotionReconcileResult {
  let changed = false
  let lists = state.lists
  if (!lists.some((l) => l.id === NOTION_LIST_ID)) {
    const maxOrder = Math.max(0, ...lists.map((l) => l.order))
    lists = [...lists, { id: NOTION_LIST_ID, name: payload.databaseTitle, color: opts.listColor, order: maxOrder + 1, kind: 'tasks', updatedAt: opts.now }]
    changed = true
  }

  const byId = new Map(state.tasks.map((t) => [t.id, t]))
  const wanted = new Set<string>()
  const updates = new Map<string, Task>()
  const additions: Task[] = []
  const pulled: Record<string, PulledFields> = { ...(opts.pulled ?? {}) }
  let nextOrder = Math.max(-1, ...state.tasks.filter((t) => t.listId === NOTION_LIST_ID).map((t) => t.order)) + 1

  for (const page of payload.pages) {
    const id = notionTaskId(page.pageId, page.status)
    if (wanted.has(id)) continue
    wanted.add(id)
    const title = opts.titleFor(page)
    const { dueDate, dueTime } = splitNotionDate(page.date)
    const existing = byId.get(id)

    if (!existing) {
      pulled[id] = { title, dueDate, dueTime }
      additions.push({
        ...TASK_DEFAULTS,
        id,
        title,
        description: page.url,
        completed: false,
        completedAt: null,
        createdAt: opts.now,
        updatedAt: opts.now,
        order: nextOrder++,
        listId: NOTION_LIST_ID,
        sectionId: null,
        parentId: null,
        dueDate: payload.datesEnabled ? dueDate : null,
        dueTime: payload.datesEnabled ? dueTime : null,
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

    if (existing.completed || existing.archivedAt || existing.deletedAt) continue
    // ユーザーが手元で変えたタイトル・期限は上書きしない
    const patch = externalPatch(existing, { title, dueDate, dueTime }, opts.pulled?.[id], {
      remember: Boolean(opts.pulled),
      due: Boolean(payload.datesEnabled),
    })
    pulled[id] = { title, dueDate, dueTime }
    if (Object.keys(patch).length > 0) updates.set(id, { ...existing, ...patch, updatedAt: opts.now })
  }

  const autoCompletedIds: string[] = []
  for (const t of state.tasks) {
    if (t.completed || t.archivedAt || t.deletedAt || wanted.has(t.id)) continue
    if (!parseNotionTaskId(t.id)) continue
    updates.set(t.id, { ...t, completed: true, completedAt: opts.now, updatedAt: opts.now })
    autoCompletedIds.push(t.id)
  }

  if (updates.size === 0 && additions.length === 0) {
    return { lists, tasks: state.tasks, autoCompletedIds, pulled, changed }
  }
  return {
    lists,
    tasks: [...state.tasks.map((t) => updates.get(t.id) ?? t), ...additions],
    autoCompletedIds,
    pulled,
    changed: true,
  }
}
