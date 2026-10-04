import type { Task } from '../types/task'
import type { TaskList } from '../types/list'
import type { ListSection } from '../types/section'
import { CANVAS_LIST_ID, isCanvasListId } from './canvasIds'

/**
 * Canvas 連携の最初の版の id を、いまの形（学校名入り）に一度だけ書き換える。
 * 各端末は保存データの版（taskStore の migrate）で流す（サーバーの行は同じ規則で書き換え済み）。
 *
 *   最初の版: タスク `canvas-<種類>-<ID>`、セクション `canvas-course-<コースID>`
 *   いま:     タスク `canvas-<学校>-<種類>-<ID>`、セクション `canvas-course-<学校>-<コースID>`
 *
 * 最初の版から学校名入りに変えたとき移し替えなかったので、同じ課題がいまの id でもう 1 つ取り込まれている。
 * - いまの id の課題（双子）があれば、古い方に利用者が書いたもの（色・メモ・予定・通知・完了・置き場所）を
 *   双子に写し、サブタスクを双子の下へ付け替えてから、古い方を消す
 * - 双子が無ければ、古い方の id をいまの形に付け替える（次の取り込みで同じ行として扱われる）
 * - 未分類に落ちた Canvas の課題は、Canvas のリストの科目のセクションへ戻す（同期で元のリストを見失ったもの）
 * - Canvas の課題のサブタスクは、親と同じリストに置く
 * 学校が分からないもの（双子が無く、URL も手がかりにならない）は触らない。
 */

const INBOX_LIST_ID = '__inbox__'
const LEGACY_TASK_RE = /^canvas-(assignment|quiz|discussion_topic|wiki_page|planner_note)-(\d+)$/
const LEGACY_SECTION_RE = /^canvas-course-(\d+)$/
const TASK_RE = /^canvas-([a-z0-9.-]+)-(assignment|quiz|discussion_topic|wiki_page|planner_note)-(\d+)$/
const SECTION_RE = /^canvas-course-([a-z0-9.-]+)-(\d+)$/

type State = { lists: TaskList[]; sections: ListSection[]; tasks: Task[] }

/** 課題の URL（最初の版から description に入れている）のホスト名とコース ID */
function urlParts(description: string): { host: string | null; courseId: string | null } {
  const m = /^https?:\/\/([^/\s]+)(?:\/courses\/(\d+))?/i.exec(description.trim())
  return { host: m ? m[1].toLowerCase() : null, courseId: m?.[2] ?? null }
}

/** 古い課題に利用者が書いたものを双子に写す。Canvas が決めるもの（題名・期限）は双子のまま */
function mergeInto(twin: Task, old: Task, now: string): Task {
  // ゴミ箱に入れた方は写さない。双子だけをゴミ箱に入れていたなら、古い方をそのまま双子の id で残す
  if (old.deletedAt) return twin
  if (twin.deletedAt) return { ...old, id: twin.id, updatedAt: now }
  const next: Task = { ...twin, updatedAt: now }
  if (!next.color && old.color) next.color = old.color
  if (next.priority === 'none' && old.priority !== 'none') next.priority = old.priority
  if (next.tags.length === 0 && old.tags.length > 0) next.tags = old.tags
  if (!next.scheduledDate && old.scheduledDate) {
    next.scheduledDate = old.scheduledDate
    next.startTime = old.startTime
    next.endTime = old.endTime
    next.endDate = old.endDate ?? null
  }
  if (!next.location && old.location) next.location = old.location
  if (!next.reminders && old.reminders) next.reminders = old.reminders
  // URL のあとにメモを書き足していたら、そちらを残す
  if (old.description.length > next.description.length && old.description.startsWith(next.description)) {
    next.description = old.description
  }
  if (old.completed && !next.completed) {
    next.completed = true
    next.completedAt = old.completedAt
  }
  if (old.archivedAt && !next.archivedAt) next.archivedAt = old.archivedAt
  // 自分のリストへ移していたら、そこに置く
  if (old.listId !== INBOX_LIST_ID && !isCanvasListId(old.listId)) {
    next.listId = old.listId
    next.sectionId = old.sectionId
  }
  return next
}

export function migrateLegacyCanvasIds<S extends State>(state: S, now: string): S {
  const tasks = state.tasks
  const byId = new Map(tasks.map((t) => [t.id, t]))

  // 学校の一覧: いまの形の id に出てくるもの
  const knownConns = new Set<string>()
  /** `<種類>-<ID>` → いまの形の id（学校が 1 つに決まるときだけ） */
  const twinIdByKey = new Map<string, string | null>()
  for (const t of tasks) {
    const m = TASK_RE.exec(t.id)
    if (!m) continue
    knownConns.add(m[1])
    const key = `${m[2]}-${m[3]}`
    twinIdByKey.set(key, twinIdByKey.has(key) && twinIdByKey.get(key) !== t.id ? null : t.id)
  }
  for (const s of state.sections) {
    const m = SECTION_RE.exec(s.id)
    if (m) knownConns.add(m[1])
  }
  const onlyConn = knownConns.size === 1 ? [...knownConns][0] : null

  /** 古い課題の学校: 双子 → URL のホスト（知っている学校なら。知らなくても学校が 1 つも無ければ使う）→ 唯一の学校 */
  const connFor = (t: Task, type: string, id: string): string | null => {
    const twinId = twinIdByKey.get(`${type}-${id}`)
    if (twinId) return TASK_RE.exec(twinId)![1]
    const { host } = urlParts(t.description)
    if (host && (knownConns.has(host) || knownConns.size === 0)) return host
    return onlyConn
  }

  // 1. タスク
  const idMap = new Map<string, string>() // 古い id → いまの id
  const replaced = new Map<string, Task>() // いまの id → 書き換えた行
  const removed = new Set<string>()
  const sectionConn = new Map<string, string>() // 古いセクション id → 学校
  for (const t of tasks) {
    const m = LEGACY_TASK_RE.exec(t.id)
    if (!m) continue
    const conn = connFor(t, m[1], m[2])
    if (!conn) continue
    const newId = `canvas-${conn}-${m[1]}-${m[2]}`
    idMap.set(t.id, newId)
    if (t.sectionId && LEGACY_SECTION_RE.test(t.sectionId)) sectionConn.set(t.sectionId, conn)
    const twin = replaced.get(newId) ?? byId.get(newId)
    if (twin) {
      replaced.set(newId, mergeInto(twin, t, now))
      removed.add(t.id)
    } else {
      replaced.set(newId, { ...t, id: newId, updatedAt: now })
    }
  }

  // 2. セクション: 古い科目のセクションは、いまの形へ（あればそこへまとめる）
  // 学校は、そのセクションの課題 → 同じコースの課題の URL → 唯一の学校（1 で付け替えた課題の学校も数える）
  const courseConn = new Map<string, string>()
  for (const t of tasks) {
    const m = TASK_RE.exec(idMap.get(t.id) ?? t.id)
    const { courseId } = urlParts(t.description)
    if (m && courseId && !courseConn.has(courseId)) courseConn.set(courseId, m[1])
  }
  for (const id of idMap.values()) knownConns.add(TASK_RE.exec(id)![1])
  const sectionOnlyConn = knownConns.size === 1 ? [...knownConns][0] : null
  const sectionIds = new Set(state.sections.map((s) => s.id))
  const sectionMap = new Map<string, string>()
  const sections: ListSection[] = []
  for (const s of state.sections) {
    const m = LEGACY_SECTION_RE.exec(s.id)
    const conn = m ? (sectionConn.get(s.id) ?? courseConn.get(m[1]) ?? sectionOnlyConn) : null
    if (!m || !conn) {
      sections.push(s)
      continue
    }
    const newId = `canvas-course-${conn}-${m[1]}`
    sectionMap.set(s.id, newId)
    if (!sectionIds.has(newId)) {
      sections.push({ ...s, id: newId, updatedAt: now })
      sectionIds.add(newId)
    }
  }
  const sectionListById = new Map(sections.map((s) => [s.id, s.listId]))

  // 3. 付け替え: 親・セクション・未分類に落ちた課題
  let changed = idMap.size > 0 || sectionMap.size > 0
  const out: Task[] = []
  const emitted = new Set<string>()
  for (const orig of tasks) {
    if (removed.has(orig.id)) continue
    const newId = idMap.get(orig.id) ?? orig.id
    if (emitted.has(newId)) continue
    emitted.add(newId)
    let t = replaced.get(newId) ?? orig
    const parentId = t.parentId ? (idMap.get(t.parentId) ?? t.parentId) : null
    const sectionId = t.sectionId ? (sectionMap.get(t.sectionId) ?? t.sectionId) : null
    if (parentId !== t.parentId || sectionId !== t.sectionId) t = { ...t, parentId, sectionId, updatedAt: now }

    const m = TASK_RE.exec(t.id)
    if (m && t.listId === INBOX_LIST_ID && !t.parentId && !t.deletedAt) {
      const { courseId } = urlParts(t.description)
      const sec = courseId ? `canvas-course-${m[1]}-${courseId}` : null
      const listId = sec ? (sectionListById.get(sec) ?? CANVAS_LIST_ID) : CANVAS_LIST_ID
      if (state.lists.some((l) => l.id === listId)) {
        t = { ...t, listId, sectionId: sec && sectionListById.has(sec) ? sec : null, updatedAt: now }
        changed = true
      }
    }
    out.push(t)
  }

  // 4. Canvas の課題のサブタスクは、親（いちばん上の課題）と同じリストに置く
  const outById = new Map(out.map((t) => [t.id, t]))
  const rootOf = (t: Task): Task => {
    let cur = t
    for (let i = 0; i < 20 && cur.parentId && outById.has(cur.parentId); i++) cur = outById.get(cur.parentId)!
    return cur
  }
  for (let i = 0; i < out.length; i++) {
    const t = out[i]
    if (!t.parentId) continue
    const root = rootOf(t)
    if (TASK_RE.test(root.id) && root.listId !== t.listId) {
      out[i] = { ...t, listId: root.listId, sectionId: null, updatedAt: now }
      changed = true
    }
  }
  return changed ? { ...state, sections, tasks: out } : state
}
