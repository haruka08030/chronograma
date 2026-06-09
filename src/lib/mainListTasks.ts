import { isToday, parseISO, addDays, isBefore, isSameDay, startOfDay } from 'date-fns'
import type { Task } from '../types/task'
import { isListedTimeLog } from './timeLogTask'
import type { ListSection } from '../types/section'
import type { SmartView, SortMode } from '../store/taskStore'
import { DROPSEC_PREFIX, parseSectionReorderId } from './sectionReorderDnD'

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
  } else if (selectedView === 'overdue') {
    const todayStart = startOfDay(new Date())
    result = result.filter((t) => {
      if (!t.dueDate) return false
      const d = startOfDay(parseISO(t.dueDate))
      return isBefore(d, todayStart)
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
  const active = filtered.filter((t) => !t.completed && !isListedTimeLog(t))
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

/** 表示順 `ids` 上でブロックをまとめて移動 */
export function moveRootBlockInOrderedIds(
  ids: string[],
  blockOrdered: string[],
  activeRootId: string,
  overTaskId: string,
): string[] | null {
  const set = new Set(blockOrdered)
  if (!set.has(activeRootId)) return null
  const rest = ids.filter((id) => !set.has(id))
  const oldIndex = ids.indexOf(activeRootId)
  const newIndex = ids.indexOf(overTaskId)
  if (oldIndex < 0 || newIndex < 0) return null
  let insert = rest.indexOf(overTaskId)
  if (insert < 0) return null
  if (oldIndex < newIndex) insert += 1
  return [...rest.slice(0, insert), ...blockOrdered, ...rest.slice(insert)]
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

/** 複数ルートをセクション帯へ一度に挿入 */
export function insertActiveRootIdsForSectionDrop(
  currentOrdered: Task[],
  movedIds: string[],
  targetSectionId: string | null,
  listSections: ListSection[],
): string[] {
  const set = new Set(movedIds)
  const blockOrdered = currentOrdered.map((t) => t.id).filter((id) => set.has(id))
  const filtered = currentOrdered.filter((t) => !set.has(t.id))
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
  ids.splice(ins, 0, ...blockOrdered)
  return ids
}

/** セクション見出しドロップ＝そのセクションの先頭へ（空ならブロック先頭） */
export function insertActiveRootAtSectionHead(
  currentOrdered: Task[],
  movedId: string,
  targetSectionId: string,
  listSections: ListSection[],
): string[] {
  const filtered = currentOrdered.filter((t) => t.id !== movedId)
  const rank = (sid: string | null) => sectionRankForList(sid, listSections)
  const targetR = rank(targetSectionId)
  const firstInSection = filtered.findIndex((t) => (t.sectionId ?? null) === targetSectionId)
  let ins: number
  if (firstInSection >= 0) {
    ins = firstInSection
  } else {
    const idx = filtered.findIndex((t) => rank(t.sectionId ?? null) > targetR)
    ins = idx < 0 ? filtered.length : idx
  }
  const ids = filtered.map((t) => t.id)
  ids.splice(ins, 0, movedId)
  return ids
}

/** 複数ルートをセクション見出しドロップ先へ一度に挿入 */
export function insertActiveRootIdsAtSectionHead(
  currentOrdered: Task[],
  movedIds: string[],
  targetSectionId: string,
  listSections: ListSection[],
): string[] {
  const set = new Set(movedIds)
  const blockOrdered = currentOrdered.map((t) => t.id).filter((id) => set.has(id))
  const filtered = currentOrdered.filter((t) => !set.has(t.id))
  const rank = (sid: string | null) => sectionRankForList(sid, listSections)
  const targetR = rank(targetSectionId)
  const firstInSection = filtered.findIndex((t) => (t.sectionId ?? null) === targetSectionId)
  let ins: number
  if (firstInSection >= 0) {
    ins = firstInSection
  } else {
    const idx = filtered.findIndex((t) => rank(t.sectionId ?? null) > targetR)
    ins = idx < 0 ? filtered.length : idx
  }
  const ids = filtered.map((t) => t.id)
  ids.splice(ins, 0, ...blockOrdered)
  return ids
}

const TASK_PREFIX = 'task::'

export type ManualRootReorderSectionUpdate = { taskIds: string[]; sectionId: string | null }

/** 手動ソート一覧でのルート並べ替え（複数 ID 可）。`dragGroupRootIds` は表示順に正規化される */
export function buildReorderedActiveRootIdsForGroup(
  currentOrdered: Task[],
  activeRootId: string,
  overId: string,
  dragGroupRootIds: string[],
  sections: ListSection[],
  selectedListId: string | null,
): { orderedIds: string[]; sectionUpdate?: ManualRootReorderSectionUpdate } | null {
  const rootIdsOrdered = currentOrdered.map((t) => t.id)
  const sel = new Set(dragGroupRootIds)
  const orderedGroup = rootIdsOrdered.filter((id) => sel.has(id))
  if (orderedGroup.length === 0 || !orderedGroup.includes(activeRootId)) return null

  const listSections = selectedListId
    ? sections.filter((s) => s.listId === selectedListId).sort((a, b) => a.order - b.order)
    : []
  const useSectionPatch = Boolean(selectedListId && listSections.length > 0)

  const headerDrop = parseSectionReorderId(overId, DROPSEC_PREFIX)
  if (
    useSectionPatch &&
    headerDrop &&
    headerDrop.listId === selectedListId &&
    headerDrop.sectionId
  ) {
    const orderedIds = insertActiveRootIdsAtSectionHead(
      currentOrdered,
      orderedGroup,
      headerDrop.sectionId,
      listSections,
    )
    return {
      orderedIds,
      sectionUpdate: { taskIds: orderedGroup, sectionId: headerDrop.sectionId },
    }
  }

  const dropParsed = parseSectionDropId(overId)
  if (dropParsed && dropParsed.listId === selectedListId) {
    const orderedIds = insertActiveRootIdsForSectionDrop(
      currentOrdered,
      orderedGroup,
      dropParsed.sectionId,
      listSections,
    )
    return useSectionPatch
      ? { orderedIds, sectionUpdate: { taskIds: orderedGroup, sectionId: dropParsed.sectionId } }
      : { orderedIds }
  }

  if (!overId.startsWith(TASK_PREFIX)) return null
  const overTaskId = overId.slice(TASK_PREFIX.length)
  const orderedIds = moveRootBlockInOrderedIds(rootIdsOrdered, orderedGroup, activeRootId, overTaskId)
  if (!orderedIds) return null
  if (!useSectionPatch) {
    return { orderedIds }
  }
  const overTask = currentOrdered.find((t) => t.id === overTaskId)
  return {
    orderedIds,
    sectionUpdate: {
      taskIds: orderedGroup,
      sectionId: overTask ? (overTask.sectionId ?? null) : null,
    },
  }
}

export function buildReorderedActiveRootIds(
  currentOrdered: Task[],
  activeId: string,
  overId: string,
  sections: ListSection[],
  selectedListId: string | null,
): { orderedIds: string[]; sectionUpdate?: ManualRootReorderSectionUpdate } | null {
  if (!activeId.startsWith(TASK_PREFIX)) return null
  const movedId = activeId.slice(TASK_PREFIX.length)
  return buildReorderedActiveRootIdsForGroup(
    currentOrdered,
    movedId,
    overId,
    [movedId],
    sections,
    selectedListId,
  )
}
