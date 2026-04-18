import { isToday, parseISO, addDays, isBefore, isSameDay, startOfDay } from 'date-fns'
import type { Task } from '../types/task'
import type { ListSection } from '../types/section'
import type { SmartView, SortMode } from '../store/taskStore'

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2, none: 3 }

export interface MainListTasksInput {
  tasks: Task[]
  selectedView: SmartView | null
  selectedListId: string | null
  sortMode: SortMode
  filterTag: string | null
  sections: ListSection[]
}

/** TaskList と同じ条件でルートタスクを絞り・ソート（子タスクは含まない） */
export function getFilteredRootTasks(input: MainListTasksInput): Task[] {
  const { tasks, selectedView, selectedListId, sortMode, filterTag } = input
  let result = tasks.filter((t) => t.parentId === null)

  if (selectedView === 'today') {
    result = result.filter((t) => t.dueDate && isToday(parseISO(t.dueDate)))
  } else if (selectedView === 'upcoming') {
    const today = startOfDay(new Date())
    const limit = startOfDay(addDays(new Date(), 7))
    result = result.filter((t) => {
      if (!t.dueDate) return false
      const d = parseISO(t.dueDate)
      return (isSameDay(d, today) || isBefore(today, d)) && (isBefore(d, limit) || isSameDay(d, limit))
    })
  } else if (selectedView === 'all') {
    // all
  } else if (selectedListId) {
    result = result.filter((t) => t.listId === selectedListId)
  }

  if (filterTag) {
    result = result.filter((t) => t.tags?.includes(filterTag))
  }

  switch (sortMode) {
    case 'dueDate':
      return [...result].sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return a.order - b.order
        if (!a.dueDate) return 1
        if (!b.dueDate) return -1
        return a.dueDate.localeCompare(b.dueDate)
      })
    case 'priority':
      return [...result].sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3))
    case 'title':
      return [...result].sort((a, b) => a.title.localeCompare(b.title, 'ja'))
    case 'createdAt':
      return [...result].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    default:
      return [...result].sort((a, b) => a.order - b.order)
  }
}

/**
 * リスト表示かつ手動ソートかつセクションありのとき、セクション順＋タスク order で並べた未完了ルート一覧。
 * それ以外は getFilteredRootTasks と同じ（未完了のみ）を返す。
 */
export function getOrderedActiveRootTasksForDnD(input: MainListTasksInput): Task[] {
  const filtered = getFilteredRootTasks(input)
  const active = filtered.filter((t) => !t.completed)
  const { selectedListId, sortMode, sections } = input

  if (!selectedListId || sortMode !== 'manual') {
    return active
  }

  const listSections = sections.filter((s) => s.listId === selectedListId).sort((a, b) => a.order - b.order)
  if (listSections.length === 0) {
    return active
  }

  const sectionRank = (sectionId: string | null): number => {
    if (sectionId === null) return -1
    const i = listSections.findIndex((s) => s.id === sectionId)
    return i >= 0 ? i : 9999
  }

  return [...active].sort((a, b) => {
    const ra = sectionRank(a.sectionId ?? null)
    const rb = sectionRank(b.sectionId ?? null)
    if (ra !== rb) return ra - rb
    return a.order - b.order
  })
}

export const SECTION_DROP_PREFIX = 'section-drop::'

/** section-drop::${listId}::none | ${sectionId} */
export function sectionDropId(listId: string, sectionId: string | null): string {
  return `${SECTION_DROP_PREFIX}${listId}::${sectionId === null ? 'none' : sectionId}`
}

export function parseSectionDropId(id: string): { listId: string; sectionId: string | null } | null {
  if (!id.startsWith(SECTION_DROP_PREFIX)) return null
  const rest = id.slice(SECTION_DROP_PREFIX.length)
  const sep = rest.indexOf('::')
  if (sep < 0) return null
  const listId = rest.slice(0, sep)
  const tail = rest.slice(sep + 2)
  if (tail === 'none') return { listId, sectionId: null }
  return { listId, sectionId: tail }
}

function arrayMoveIds(ids: string[], from: number, to: number): string[] {
  const next = [...ids]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

function sectionRankForList(sectionId: string | null, listSections: ListSection[]): number {
  if (sectionId === null) return -1
  const i = listSections.findIndex((s) => s.id === sectionId)
  return i >= 0 ? i : 9999
}

/** 空セクション末尾ドロップ後の id 列（`currentOrdered` は表示順の未完了ルート） */
export function insertActiveRootIdForSectionDrop(
  currentOrdered: Task[],
  movedId: string,
  targetSectionId: string | null,
  listSections: ListSection[],
): string[] {
  const filtered = currentOrdered.filter((t) => t.id !== movedId)
  const rank = (sid: string | null) => sectionRankForList(sid, listSections)
  let ins = filtered.length

  if (targetSectionId === null) {
    const firstNamed = filtered.findIndex((t) => rank(t.sectionId ?? null) > -1)
    ins = firstNamed < 0 ? filtered.length : firstNamed
  } else {
    for (let i = filtered.length - 1; i >= 0; i--) {
      if ((filtered[i].sectionId ?? null) === targetSectionId) {
        ins = i + 1
        break
      }
    }
    if (!filtered.some((t) => (t.sectionId ?? null) === targetSectionId)) {
      const tr0 = rank(targetSectionId)
      const idx = filtered.findIndex((t) => rank(t.sectionId ?? null) > tr0)
      ins = idx < 0 ? filtered.length : idx
    }
  }

  const ids = filtered.map((t) => t.id)
  ids.splice(ins, 0, movedId)
  return ids
}

const TASK_PREFIX = 'task::'

export function buildReorderedActiveRootIds(
  currentOrdered: Task[],
  activeId: string,
  overId: string,
  sections: ListSection[],
  selectedListId: string | null,
): { orderedIds: string[]; sectionUpdate?: { taskId: string; sectionId: string | null } } | null {
  const listSections = selectedListId
    ? sections.filter((s) => s.listId === selectedListId).sort((a, b) => a.order - b.order)
    : []
  const useSectionPatch = Boolean(selectedListId && listSections.length > 0)

  const dropParsed = parseSectionDropId(overId)
  if (dropParsed && dropParsed.listId === selectedListId) {
    const movedId = activeId.startsWith(TASK_PREFIX) ? activeId.slice(TASK_PREFIX.length) : ''
    if (!movedId) return null
    const orderedIds = insertActiveRootIdForSectionDrop(
      currentOrdered,
      movedId,
      dropParsed.sectionId,
      listSections,
    )
    return useSectionPatch
      ? { orderedIds, sectionUpdate: { taskId: movedId, sectionId: dropParsed.sectionId } }
      : { orderedIds }
  }

  if (!overId.startsWith(TASK_PREFIX) || !activeId.startsWith(TASK_PREFIX)) return null
  const movedId = activeId.slice(TASK_PREFIX.length)
  const overTaskId = overId.slice(TASK_PREFIX.length)
  const ids = currentOrdered.map((t) => t.id)
  const oldIndex = ids.indexOf(movedId)
  const newIndex = ids.indexOf(overTaskId)
  if (oldIndex < 0 || newIndex < 0) return null
  const orderedIds = arrayMoveIds(ids, oldIndex, newIndex)
  if (!useSectionPatch) {
    return { orderedIds }
  }
  const overTask = currentOrdered.find((t) => t.id === overTaskId)
  return {
    orderedIds,
    sectionUpdate: {
      taskId: movedId,
      sectionId: overTask ? (overTask.sectionId ?? null) : null,
    },
  }
}
