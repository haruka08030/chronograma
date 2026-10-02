import { useMemo, useState, useRef, useEffect, useCallback, type ReactNode, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useDndMonitor, useDroppable, type DragCancelEvent, type DragEndEvent, type DragMoveEvent, type DragStartEvent } from '@dnd-kit/core'
import { useTaskStore, INBOX_LIST_ID, type SortMode } from '../store/taskStore'
import { unplannedListIds } from '../lib/listKind'
import { ListKindPicker } from './ListKindPicker'
import {
  getFilteredRootTasks,
  getOrderedActiveRootTasksForDnD,
  sectionDropId,
} from '../lib/mainListTasks'
import { isListedTimeLog } from '../lib/timeLogTask'
import { isActiveTask } from '../lib/taskLifecycle'
import { isTodoSurfaceView } from '../lib/todoSurfaceView'
import { displayListName } from '../lib/displayListName'
import { isModKey, isSubmitEnter } from '../lib/keyboard'
import { SortableTaskItem, TASK_PREFIX, type TaskRootDragData } from './SortableTaskItem'
import { SortableSubtaskItem } from './SortableSubtaskItem'
import { SUBTASK_PREFIX, parseSubtaskDragId, subtaskDragId } from '../lib/subtaskDnD'
import { isIndentIntent } from '../lib/taskDragIntent'
import { getIndentTargetId } from '../lib/taskDepth'
import { SectionHeaderDnD } from './SectionHeaderDnD'
import { DRAGSEC_PREFIX } from '../lib/sectionReorderDnD'
import { TaskItem, type TaskItemSelection } from './TaskItem'
import { TaskDetail } from './TaskDetail'
import { QuickAdd } from './QuickAdd'
import type { Priority, Task } from '../types/task'
import { CompleteWithLogModal, type CompleteWithLogDraft } from './CompleteWithLogModal'
import { useTaskDetailModal } from '../hooks/useTaskDetailModal'
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { durationMinutesForTaskSlot, taskPlacementDate } from '../lib/taskTimeRange'
import { CloseIcon, PencilIcon } from './icons'

const SORT_OPTIONS: SortMode[] = ['manual', 'dueDate', 'priority', 'title', 'createdAt']

function countIncompleteDescendants(parentId: string, childrenByParent: Map<string, Task[]>): number {
  let n = 0
  for (const st of childrenByParent.get(parentId) ?? []) {
    if (!st.completed && !isListedTimeLog(st)) {
      n += 1 + countIncompleteDescendants(st.id, childrenByParent)
    }
  }
  return n
}

function DnDSubtreeRows({
  parentId,
  depth,
  incompleteSubtasks,
  makeRowClick,
  makeSelection,
  openCompleteWithLog,
  onEnterCreateSibling,
  pendingAutoEditTaskId,
  subtaskNestWithDrag,
  nestPreviewParentId,
}: {
  parentId: string
  depth: number
  incompleteSubtasks: (id: string) => Task[]
  makeRowClick: (id: string) => (e: MouseEvent) => void
  makeSelection: (id: string) => TaskItemSelection
  openCompleteWithLog: (task: Task) => void
  onEnterCreateSibling: (task: Task) => void
  pendingAutoEditTaskId: string | null
  subtaskNestWithDrag: string
  nestPreviewParentId: string | null
}): ReactNode[] {
  return incompleteSubtasks(parentId).flatMap((st): ReactNode[] => [
    <div key={st.id} className={`${subtaskNestWithDrag}${depth > 0 ? ' ml-2' : ''}`}>
      <SortableSubtaskItem
        task={st}
        onRowClick={makeRowClick(st.id)}
        onCompleteRequest={openCompleteWithLog}
        onEnterCreateSibling={onEnterCreateSibling}
        selection={makeSelection(st.id)}
        autoEdit={pendingAutoEditTaskId === st.id}
        showNestGuide={st.id === nestPreviewParentId}
      />
    </div>,
    ...DnDSubtreeRows({
      parentId: st.id,
      depth: depth + 1,
      incompleteSubtasks,
      makeRowClick,
      makeSelection,
      openCompleteWithLog,
      onEnterCreateSibling,
      pendingAutoEditTaskId,
      subtaskNestWithDrag,
      nestPreviewParentId,
    }),
  ])
}

function StaticSubtreeRows({
  parentId,
  depth,
  incompleteSubtasks,
  makeRowClick,
  makeSelection,
  openCompleteWithLog,
  onEnterCreateSibling,
  pendingAutoEditTaskId,
  subtaskNestNoDrag,
}: {
  parentId: string
  depth: number
  incompleteSubtasks: (id: string) => Task[]
  makeRowClick: (id: string) => (e: MouseEvent) => void
  makeSelection: (id: string) => TaskItemSelection
  openCompleteWithLog: (task: Task) => void
  onEnterCreateSibling: (task: Task) => void
  pendingAutoEditTaskId: string | null
  subtaskNestNoDrag: string
}): ReactNode[] {
  return incompleteSubtasks(parentId).map((st): ReactNode => (
    <div key={st.id} className={`${subtaskNestNoDrag}${depth > 0 ? ' ml-1.5' : ''}`}>
      <TaskItem
        task={st}
        isSubtask
        onRowClick={makeRowClick(st.id)}
        onCompleteRequest={openCompleteWithLog}
        onEnterCreateSibling={onEnterCreateSibling}
        selection={makeSelection(st.id)}
        autoEdit={pendingAutoEditTaskId === st.id}
      />
      {StaticSubtreeRows({
        parentId: st.id,
        depth: depth + 1,
        incompleteSubtasks,
        makeRowClick,
        makeSelection,
        openCompleteWithLog,
        onEnterCreateSibling,
        pendingAutoEditTaskId,
        subtaskNestNoDrag,
      })}
    </div>
  ))
}

function CompletedSubtreeRows({
  parentId,
  depth,
  childrenByParent,
  makeRowClick,
  makeSelection,
  openCompleteWithLog,
  onEnterCreateSibling,
  pendingAutoEditTaskId,
  subtaskNestNoDrag,
}: {
  parentId: string
  depth: number
  childrenByParent: Map<string, Task[]>
  makeRowClick: (id: string) => (e: MouseEvent) => void
  makeSelection: (id: string) => TaskItemSelection
  openCompleteWithLog: (task: Task) => void
  onEnterCreateSibling: (task: Task) => void
  pendingAutoEditTaskId: string | null
  subtaskNestNoDrag: string
}): ReactNode[] {
  return (childrenByParent.get(parentId) ?? []).map((st): ReactNode => (
    <div key={st.id} className={`${subtaskNestNoDrag}${depth > 0 ? ' ml-1.5' : ''}`}>
      <TaskItem
        task={st}
        isSubtask
        onRowClick={makeRowClick(st.id)}
        onCompleteRequest={openCompleteWithLog}
        onEnterCreateSibling={onEnterCreateSibling}
        selection={makeSelection(st.id)}
        autoEdit={pendingAutoEditTaskId === st.id}
      />
      {CompletedSubtreeRows({
        parentId: st.id,
        depth: depth + 1,
        childrenByParent,
        makeRowClick,
        makeSelection,
        openCompleteWithLog,
        onEnterCreateSibling,
        pendingAutoEditTaskId,
        subtaskNestNoDrag,
      })}
    </div>
  ))
}

function SectionDropZone({ listId, sectionId }: { listId: string; sectionId: string | null }) {
  const { setNodeRef, isOver } = useDroppable({ id: sectionDropId(listId, sectionId) })
  return (
    <div
      ref={setNodeRef}
      className={`min-h-3 mx-2 rounded-md transition-colors ${isOver ? 'bg-accent-500/15 ring-1 ring-accent-400/40' : ''}`}
      aria-hidden
    />
  )
}

const BULK_PRIORITY_OPTIONS: Priority[] = ['high', 'medium', 'low', 'none']

export function TaskList() {
  const { t } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const selectedListId = useTaskStore((s) => s.selectedListId)
  const selectedView = useTaskStore((s) => s.selectedView)
  const lists = useTaskStore((s) => s.lists)
  const sortMode = useTaskStore((s) => s.sortMode)
  const setSortMode = useTaskStore((s) => s.setSortMode)
  const filterTag = useTaskStore((s) => s.filterTag)
  const setFilterTag = useTaskStore((s) => s.setFilterTag)
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const addTaskAfter = useTaskStore((s) => s.addTaskAfter)
  const addTimeLog = useTaskStore((s) => s.addTimeLog)
  const bulkUpdateTasks = useTaskStore((s) => s.bulkUpdateTasks)
  const deleteTasks = useTaskStore((s) => s.deleteTasks)
  const archiveTasks = useTaskStore((s) => s.archiveTasks)
  const sections = useTaskStore((s) => s.sections)
  const addSectionStore = useTaskStore((s) => s.addSection)
  const renameSectionStore = useTaskStore((s) => s.renameSection)
  const deleteSectionStore = useTaskStore((s) => s.deleteSection)
  const setQuickAddSectionId = useTaskStore((s) => s.setQuickAddSectionId)
  const quickAddSectionId = useTaskStore((s) => s.quickAddSectionId)
  const { detailTask, openDetail, closeDetail } = useTaskDetailModal(tasks)
  const [showSort, setShowSort] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [completionDraft, setCompletionDraft] = useState<CompleteWithLogDraft | null>(null)
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null)
  const [editingSectionName, setEditingSectionName] = useState('')
  const [pendingAutoEditTaskId, setPendingAutoEditTaskId] = useState<string | null>(null)
  const [previewParentId, setPreviewParentId] = useState<string | null>(null)
  const previewParentIdRef = useRef<string | null>(null)
  const selectedRef = useRef(selected)
  const lastAnchorRef = useRef<string | null>(null)

  const clearNestPreview = useCallback(() => {
    if (previewParentIdRef.current === null) return
    previewParentIdRef.current = null
    setPreviewParentId(null)
  }, [])

  const updateNestPreview = useCallback((next: string | null) => {
    if (previewParentIdRef.current === next) return
    previewParentIdRef.current = next
    setPreviewParentId(next)
  }, [])

  useEffect(() => {
    selectedRef.current = selected
  }, [selected])

  const clearSelection = useCallback(() => {
    setSelected(new Set())
    lastAnchorRef.current = null
  }, [])

  useEffect(() => {
    queueMicrotask(() => clearSelection())
  }, [selectedListId, selectedView, filterTag, sortMode, clearSelection])

  useEffect(() => {
    queueMicrotask(() => {
      setEditingSectionId(null)
      setEditingSectionName('')
    })
  }, [selectedListId, selectedView])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const t = document.activeElement
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return
      if (t instanceof HTMLElement && t.isContentEditable) return
      if (selectedRef.current.size === 0) return
      e.preventDefault()
      clearSelection()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [clearSelection, selected.size])

  const dndMonitor = useMemo(
    () => ({
      onDragStart({ active }: DragStartEvent) {
        clearNestPreview()
        const id = String(active.id)
        if (id.startsWith(DRAGSEC_PREFIX)) {
          clearSelection()
          return
        }
        if (id.startsWith(SUBTASK_PREFIX)) {
          clearSelection()
          return
        }
        if (id.startsWith(TASK_PREFIX)) {
          const group = (active.data.current as TaskRootDragData | undefined)?.dragGroupRootIds
          if (!group || group.length <= 1) clearSelection()
        }
      },
      onDragMove({ active, delta }: DragMoveEvent) {
        const id = String(active.id)
        if (!id.startsWith(TASK_PREFIX) && !id.startsWith(SUBTASK_PREFIX)) {
          updateNestPreview(null)
          return
        }
        const group = (active.data.current as TaskRootDragData | undefined)?.dragGroupRootIds
        if (group && group.length > 1) {
          updateNestPreview(null)
          return
        }
        const taskId = id.startsWith(SUBTASK_PREFIX)
          ? parseSubtaskDragId(id)
          : id.slice(TASK_PREFIX.length)
        if (!taskId || !isIndentIntent(delta)) {
          updateNestPreview(null)
          return
        }
        updateNestPreview(getIndentTargetId(useTaskStore.getState().tasks, taskId))
      },
      onDragEnd({ active }: DragEndEvent) {
        clearNestPreview()
        const group = (active.data.current as TaskRootDragData | undefined)?.dragGroupRootIds
        if (group && group.length > 1) clearSelection()
      },
      onDragCancel({ active }: DragCancelEvent) {
        clearNestPreview()
        const group = (active.data.current as TaskRootDragData | undefined)?.dragGroupRootIds
        if (group && group.length > 1) clearSelection()
      },
    }),
    [clearSelection, clearNestPreview, updateNestPreview],
  )
  useDndMonitor(dndMonitor)

  const currentList = selectedListId ? lists.find((l) => l.id === selectedListId) : null
  const sortOptions = useMemo(
    () => SORT_OPTIONS.map((value) => ({ value, label: t(`taskList.sort.${value}`) })),
    [t],
  )
  const bulkPriorityOptions = useMemo(
    () => BULK_PRIORITY_OPTIONS.map((value) => ({ value, label: t(`common.${value}`) })),
    [t],
  )
  const title = selectedView
    ? t(`sidebar.views.${selectedView}`)
    : (currentList ? displayListName(currentList.id, currentList.name) : t('taskList.defaultTitle'))

  const listOrderById = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of lists) m.set(l.id, l.order)
    return m
  }, [lists])
  const excludedListIds = useMemo(() => unplannedListIds(lists), [lists])
  const selectedList = selectedListId ? lists.find((l) => l.id === selectedListId) ?? null : null

  const filtered = useMemo(
    () =>
      getFilteredRootTasks({
        tasks,
        selectedView,
        selectedListId,
        sortMode,
        filterTag,
        sections,
        excludedListIds,
      }),
    [tasks, selectedView, selectedListId, sortMode, filterTag, sections, excludedListIds],
  )

  const listSectionsOrdered = useMemo(() => {
    if (!selectedListId) return []
    return sections.filter((s) => s.listId === selectedListId).sort((a, b) => a.order - b.order)
  }, [sections, selectedListId])

  // リスト選択時はそのリストのセクション。スマートビューでは、表示対象タスクが属する
  // リストにセクションがあるとき、リスト横断でセクションブロックを出す。
  const multiListSectionMode = !selectedListId && isTodoSurfaceView(selectedView)
  const showSectionBlocks = useMemo(() => {
    if (selectedListId) return listSectionsOrdered.length > 0
    if (!multiListSectionMode || sections.length === 0) return false
    const listIds = new Set(
      filtered.filter((t) => !t.completed && !isListedTimeLog(t)).map((t) => t.listId),
    )
    return sections.some((s) => listIds.has(s.listId))
  }, [selectedListId, listSectionsOrdered.length, multiListSectionMode, sections, filtered])

  /** 親 ID → サブタスク（`order` 昇順）。TickTick 風に一覧で親の直下へ出す */
  const childrenByParent = useMemo(() => {
    const m = new Map<string, typeof tasks>()
    for (const t of tasks) {
      if (!t.parentId || !isActiveTask(t)) continue
      const arr = m.get(t.parentId)
      if (arr) arr.push(t)
      else m.set(t.parentId, [t])
    }
    for (const arr of m.values()) arr.sort((a, b) => a.order - b.order)
    return m
  }, [tasks])

  const incompleteCount = useMemo(() => {
    let n = 0
    for (const p of filtered) {
      if (!p.completed && !isListedTimeLog(p)) n++
      n += countIncompleteDescendants(p.id, childrenByParent)
    }
    return n
  }, [filtered, childrenByParent])

  const active = useMemo(() => {
    const incomplete = filtered.filter((t) => !t.completed && !isListedTimeLog(t))
    // 手動以外は filtered が既にソート済みなので、その順序を維持したまま
    // セクションごとにバケット分けする（下の sectionBlocks で分割）。
    if (!showSectionBlocks || sortMode !== 'manual') return incomplete
    return getOrderedActiveRootTasksForDnD({
      tasks,
      selectedView,
      selectedListId,
      sortMode,
      filterTag,
      sections,
      listOrderById,
      excludedListIds,
    })
  }, [filtered, showSectionBlocks, tasks, selectedView, selectedListId, sortMode, filterTag, sections, listOrderById, excludedListIds])

  type SectionBlockRow = {
    listId: string
    sectionId: string | null
    title: string
    /** マルチリスト時、このブロックの直前に出すリスト名 */
    listTitle: string | null
    tasks: typeof active
    headerKind: 'section-none' | 'section-named' | 'list-only'
  }

  const sectionBlocks = useMemo((): SectionBlockRow[] | null => {
    if (!showSectionBlocks) return null

    if (selectedListId) {
      const map = new Map<string | null, typeof active>()
      map.set(null, [])
      for (const s of listSectionsOrdered) map.set(s.id, [])
      for (const t of active) {
        const sid = t.sectionId ?? null
        const bucket = map.get(sid)
        if (bucket) bucket.push(t)
        else map.get(null)!.push(t)
      }
      const rows: SectionBlockRow[] = [
        {
          listId: selectedListId,
          sectionId: null,
          title: t('sections.noneTitle'),
          listTitle: null,
          tasks: map.get(null) ?? [],
          headerKind: 'section-none',
        },
      ]
      for (const s of listSectionsOrdered) {
        rows.push({
          listId: selectedListId,
          sectionId: s.id,
          title: s.name,
          listTitle: null,
          tasks: map.get(s.id) ?? [],
          headerKind: 'section-named',
        })
      }
      return rows
    }

    // スマートビュー: リスト order 順に、セクションがあるリストはセクション分割、無いリストはフラット
    const sortedLists = [...lists].sort((a, b) => a.order - b.order)
    const activeByList = new Map<string, typeof active>()
    for (const t of active) {
      const arr = activeByList.get(t.listId)
      if (arr) arr.push(t)
      else activeByList.set(t.listId, [t])
    }

    const rows: SectionBlockRow[] = []
    for (const list of sortedLists) {
      const listTasks = activeByList.get(list.id)
      if (!listTasks || listTasks.length === 0) continue

      const listSecs = sections
        .filter((s) => s.listId === list.id)
        .sort((a, b) => a.order - b.order)
      const listLabel = displayListName(list.id, list.name)

      if (listSecs.length === 0) {
        rows.push({
          listId: list.id,
          sectionId: null,
          title: listLabel,
          listTitle: null,
          tasks: listTasks,
          headerKind: 'list-only',
        })
        continue
      }

      const map = new Map<string | null, typeof active>()
      map.set(null, [])
      for (const s of listSecs) map.set(s.id, [])
      for (const t of listTasks) {
        const sid = t.sectionId ?? null
        const bucket = map.get(sid)
        if (bucket) bucket.push(t)
        else map.get(null)!.push(t)
      }

      let first = true
      const pushRow = (
        sectionId: string | null,
        title: string,
        tasksIn: typeof active,
        headerKind: 'section-none' | 'section-named',
      ) => {
        rows.push({
          listId: list.id,
          sectionId,
          title,
          listTitle: first ? listLabel : null,
          tasks: tasksIn,
          headerKind,
        })
        first = false
      }
      pushRow(null, t('sections.noneTitle'), map.get(null) ?? [], 'section-none')
      for (const s of listSecs) {
        pushRow(s.id, s.name, map.get(s.id) ?? [], 'section-named')
      }
    }
    return rows.length > 0 ? rows : null
  }, [showSectionBlocks, selectedListId, listSectionsOrdered, active, t, lists, sections])
  const completedTodos = filtered.filter((t) => t.completed && !isListedTimeLog(t))
  const showQuickAdd = isTodoSurfaceView(selectedView)
  const canDrag = sortMode === 'manual'

  const getDragGroupRootIds = useCallback(
    (taskId: string): string[] => {
      const rootsSelectedInOrder = active.map((t) => t.id).filter((id) => selected.has(id))
      if (selected.has(taskId) && rootsSelectedInOrder.length >= 2) return rootsSelectedInOrder
      return [taskId]
    },
    [active, selected],
  )

  const openCompleteWithLog = useCallback((task: Task) => {
    const placement = taskPlacementDate(task)
    if (task.completed || isListedTimeLog(task) || !placement || !task.startTime || !task.endTime) {
      toggleTask(task.id)
      return
    }
    setCompletionDraft({
      taskId: task.id,
      title: task.title,
      date: placement,
      endDate: task.endDate ?? placement,
      startTime: task.startTime,
      endTime: task.endTime,
      memo: task.description.trim(),
      mode: 'as-planned',
      tags: [...task.tags],
    })
  }, [toggleTask])

  const handleEnterCreateSibling = useCallback((task: Task) => {
    const newTaskId = addTaskAfter(task.id, '')
    if (!newTaskId) return
    setPendingAutoEditTaskId(newTaskId)
    queueMicrotask(() => {
      setPendingAutoEditTaskId((prev) => (prev === newTaskId ? null : prev))
    })
  }, [addTaskAfter])

  const submitCompleteWithLog = useCallback(() => {
    if (!completionDraft) return
    const memo = completionDraft.memo.trim()
    const endDateArg = completionDraft.endDate !== completionDraft.date ? completionDraft.endDate : null
    const dur = durationMinutesForTaskSlot({
      dueDate: completionDraft.date,
      endDate: endDateArg,
      startTime: completionDraft.startTime,
      endTime: completionDraft.endTime,
      isTimeLog: true,
    })
    if (dur == null || dur <= 0) {
      alert(t('alert.endAfterStart'))
      return
    }
    addTimeLog(
      completionDraft.title,
      completionDraft.date,
      completionDraft.startTime,
      completionDraft.endTime,
      completionDraft.tags,
      memo || undefined,
      endDateArg,
    )
    toggleTask(completionDraft.taskId)
    setCompletionDraft(null)
  }, [completionDraft, addTimeLog, toggleTask, t])

  const flatActiveIds = useMemo(() => {
    const out: string[] = []
    const walk = (parentId: string) => {
      for (const st of childrenByParent.get(parentId) ?? []) {
        if (!st.completed && !isListedTimeLog(st)) {
          out.push(st.id)
          walk(st.id)
        }
      }
    }
    for (const p of active) {
      out.push(p.id)
      walk(p.id)
    }
    return out
  }, [active, childrenByParent])

  const flatCompletedTodoIds = useMemo(() => {
    const out: string[] = []
    const walk = (parentId: string) => {
      for (const st of childrenByParent.get(parentId) ?? []) {
        out.push(st.id)
        walk(st.id)
      }
    }
    for (const p of completedTodos) {
      out.push(p.id)
      walk(p.id)
    }
    return out
  }, [completedTodos, childrenByParent])

  const flatCombined = useMemo(
    () => [...flatActiveIds, ...flatCompletedTodoIds],
    [flatActiveIds, flatCompletedTodoIds],
  )

  const toggleInSelection = useCallback((taskId: string) => {
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(taskId)) n.delete(taskId)
      else n.add(taskId)
      return n
    })
    lastAnchorRef.current = taskId
  }, [])

  const makeRowClick = useCallback(
    (taskId: string) => (e: React.MouseEvent) => {
      if (e.shiftKey && lastAnchorRef.current !== null) {
        const anchor = lastAnchorRef.current
        const ia = flatCombined.indexOf(anchor)
        const ib = flatCombined.indexOf(taskId)
        if (ia >= 0 && ib >= 0) {
          const lo = Math.min(ia, ib)
          const hi = Math.max(ia, ib)
          setSelected((prev) => {
            const n = new Set(prev)
            for (let i = lo; i <= hi; i++) n.add(flatCombined[i])
            return n
          })
        }
        lastAnchorRef.current = taskId
        return
      }
      if (isModKey(e)) {
        toggleInSelection(taskId)
        return
      }
      if (selectedRef.current.size > 0) {
        toggleInSelection(taskId)
        return
      }
      openDetail(taskId)
      lastAnchorRef.current = taskId
    },
    [flatCombined, openDetail, toggleInSelection],
  )

  const makeSelection = useCallback(
    (taskId: string): TaskItemSelection => ({
      selected: selected.has(taskId),
      reveal: selected.size > 0,
      onToggle: () => toggleInSelection(taskId),
    }),
    [selected, toggleInSelection],
  )

  const selectedIds = useMemo(() => [...selected], [selected])

  const bulkComplete = useCallback(() => {
    const ids = [...selected]
    for (const id of ids) toggleTask(id)
    clearSelection()
  }, [selected, toggleTask, clearSelection])

  const bulkDelete = useCallback(() => {
    if (selected.size === 0) return
    deleteTasks([...selected])
    clearSelection()
  }, [selected, deleteTasks, clearSelection])

  const bulkArchive = useCallback(() => {
    if (selected.size === 0) return
    // 件数の知らせは `archiveTasks` が「元に戻す」付きのトーストで出す（二重に出さない）
    archiveTasks([...selected])
    clearSelection()
  }, [selected, archiveTasks, clearSelection])

  const sortedLists = useMemo(() => [...lists].sort((a, b) => a.order - b.order), [lists])

  const beginSectionRename = useCallback((sectionId: string, currentName: string) => {
    setEditingSectionId(sectionId)
    setEditingSectionName(currentName)
  }, [])

  const finishSectionRename = useCallback((sectionId: string, currentName: string) => {
    if (editingSectionId !== sectionId) return
    const name = editingSectionName.trim()
    if (name && name !== currentName) renameSectionStore(sectionId, name)
    setEditingSectionId(null)
    setEditingSectionName('')
  }, [editingSectionId, editingSectionName, renameSectionStore])

  const cancelSectionRename = useCallback((sectionId: string) => {
    if (editingSectionId !== sectionId) return
    setEditingSectionId(null)
    setEditingSectionName('')
  }, [editingSectionId])

  /** 縦線付き。サブの完了サークルが親タスク名の先頭付近に来るよう ml+pl を調整（親と同じ行内順: ハンドル→選択→丸） */
  const subtaskNestRow =
    'border-l border-zinc-200 dark:border-zinc-700 ml-[13px] pl-3'
  const subtaskNestNoDrag = subtaskNestRow
  const subtaskNestWithDrag = subtaskNestRow

  const incompleteSubtasks = useCallback(
    (parentId: string) =>
      (childrenByParent.get(parentId) ?? []).filter((st) => !st.completed && !isListedTimeLog(st)),
    [childrenByParent],
  )

  /** ネストした SortableContext を避ける: DOM 順と一致する単一コンテキスト（各ルート直後にそのサブ） */
  const flatManualSortableIds = useMemo(() => {
    const appendForRoots = (roots: Task[], out: string[]) => {
      const walkSubs = (parentId: string) => {
        for (const st of incompleteSubtasks(parentId)) {
          out.push(subtaskDragId(st.id))
          walkSubs(st.id)
        }
      }
      for (const t of roots) {
        out.push(`${TASK_PREFIX}${t.id}`)
        walkSubs(t.id)
      }
    }
    const out: string[] = []
    if (showSectionBlocks && sectionBlocks) {
      for (const block of sectionBlocks) appendForRoots(block.tasks, out)
    } else {
      appendForRoots(active, out)
    }
    return out
  }, [showSectionBlocks, sectionBlocks, active, incompleteSubtasks])

  const activeContent = canDrag ? (
    <SortableContext items={flatManualSortableIds} strategy={verticalListSortingStrategy}>
      {showSectionBlocks && sectionBlocks ? (
        sectionBlocks.map((block) => {
          const sectionId = block.sectionId
          const blockKey = `${block.listId}::${sectionId ?? 'none'}::${block.headerKind}`
          const canQuickTarget = Boolean(selectedListId) && selectedListId === block.listId
          const isQuickTarget =
            canQuickTarget &&
            ((sectionId === null && quickAddSectionId === '') ||
              (sectionId !== null && quickAddSectionId === sectionId))
          return (
            <div key={blockKey} className="relative pt-3 first:pt-1">
              {block.listTitle ? (
                <div className="px-3 pb-1 pt-1 text-xs font-semibold tracking-tight text-zinc-700 dark:text-zinc-200">
                  {block.listTitle}
                </div>
              ) : null}
              {block.headerKind === 'section-named' && sectionId !== null ? (
                <SectionHeaderDnD
                  listId={block.listId}
                  sectionId={sectionId}
                  isQuickTarget={isQuickTarget}
                  titleButton={
                    editingSectionId === sectionId ? (
                      <input
                        autoFocus
                        value={editingSectionName}
                        placeholder={t('sections.defaultName')}
                        onChange={(e) => setEditingSectionName(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={() => finishSectionRename(sectionId, block.title)}
                        onKeyDown={(e) => {
                          if (isSubmitEnter(e)) {
                            e.preventDefault()
                            e.currentTarget.blur()
                            return
                          }
                          if (e.key === 'Escape') {
                            e.preventDefault()
                            cancelSectionRename(sectionId)
                          }
                        }}
                        className="w-full rounded bg-transparent text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-accent-400/50"
                      />
                    ) : (
                      <button
                        type="button"
                        className="w-full text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 truncate"
                        onClick={() => {
                          if (canQuickTarget) setQuickAddSectionId(sectionId)
                        }}
                      >
                        {block.title}
                      </button>
                    )
                  }
                  actions={
                    <span className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="p-1 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                        title={t('sections.renameTitle')}
                        onClick={() => beginSectionRename(sectionId, block.title)}
                      >
                        <PencilIcon className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        className="p-1 rounded text-zinc-400 hover:text-red-500"
                        title={t('common.delete')}
                        onClick={() => {
                          if (window.confirm(t('sections.deleteConfirm'))) {
                            deleteSectionStore(sectionId)
                          }
                        }}
                      >
                        <CloseIcon className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  }
                />
              ) : (
                <div
                  className={`relative z-10 flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg mb-0.5 transition-colors bg-white dark:bg-zinc-900
                    ${isQuickTarget ? 'ring-1 ring-accent-400/30' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'}
                    ${block.headerKind === 'list-only' ? 'text-zinc-700 dark:text-zinc-200' : ''}`}
                >
                  <button
                    type="button"
                    className={`min-w-0 flex-1 text-left truncate ${
                      block.headerKind === 'list-only'
                        ? 'text-xs font-semibold tracking-tight'
                        : 'text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400'
                    }`}
                    onClick={() => {
                      if (canQuickTarget && block.headerKind === 'section-none') setQuickAddSectionId('')
                    }}
                  >
                    {block.title}
                  </button>
                </div>
              )}
              {block.tasks.flatMap((t) => [
                <SortableTaskItem
                  key={t.id}
                  task={t}
                  dragGroupRootIds={getDragGroupRootIds(t.id)}
                  onRowClick={makeRowClick(t.id)}
                  onCompleteRequest={openCompleteWithLog}
                  onEnterCreateSibling={handleEnterCreateSibling}
                  selection={makeSelection(t.id)}
                  autoEdit={pendingAutoEditTaskId === t.id}
                  showNestGuide={t.id === previewParentId}
                />,
                ...DnDSubtreeRows({
                  parentId: t.id,
                  depth: 0,
                  incompleteSubtasks,
                  makeRowClick,
                  makeSelection,
                  openCompleteWithLog,
                  onEnterCreateSibling: handleEnterCreateSibling,
                  pendingAutoEditTaskId,
                  subtaskNestWithDrag,
                  nestPreviewParentId: previewParentId,
                }),
              ])}
              {block.headerKind !== 'list-only' ? (
                <SectionDropZone listId={block.listId} sectionId={block.sectionId} />
              ) : null}
            </div>
          )
        })
      ) : (
        active.flatMap((t) => [
          <SortableTaskItem
            key={t.id}
            task={t}
            dragGroupRootIds={getDragGroupRootIds(t.id)}
            onRowClick={makeRowClick(t.id)}
            onCompleteRequest={openCompleteWithLog}
            onEnterCreateSibling={handleEnterCreateSibling}
            selection={makeSelection(t.id)}
            autoEdit={pendingAutoEditTaskId === t.id}
            showNestGuide={t.id === previewParentId}
          />,
          ...DnDSubtreeRows({
            parentId: t.id,
            depth: 0,
            incompleteSubtasks,
            makeRowClick,
            makeSelection,
            openCompleteWithLog,
            onEnterCreateSibling: handleEnterCreateSibling,
            pendingAutoEditTaskId,
            subtaskNestWithDrag,
            nestPreviewParentId: previewParentId,
          }),
        ])
      )}
    </SortableContext>
  ) : showSectionBlocks && sectionBlocks ? (
    sectionBlocks.map((block) => (
      <div key={`${block.listId}::${block.sectionId ?? 'none'}::${block.headerKind}`} className="relative pt-3 first:pt-1">
        {block.listTitle ? (
          <div className="px-3 pb-1 pt-1 text-xs font-semibold tracking-tight text-zinc-700 dark:text-zinc-200">
            {block.listTitle}
          </div>
        ) : null}
        <button
          type="button"
          className={`relative z-10 w-full text-left px-3 py-1.5 mb-0.5 rounded-lg bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 ${
            block.headerKind === 'list-only'
              ? 'text-xs font-semibold tracking-tight text-zinc-700 dark:text-zinc-200'
              : 'text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400'
          }`}
          onClick={() => {
            if (selectedListId === block.listId) {
              setQuickAddSectionId(block.sectionId === null ? '' : block.sectionId)
            }
          }}
        >
          {block.title}
        </button>
        {block.tasks.map((t) => (
          <div key={t.id}>
            <TaskItem
              task={t}
              onRowClick={makeRowClick(t.id)}
              onCompleteRequest={openCompleteWithLog}
              onEnterCreateSibling={handleEnterCreateSibling}
              selection={makeSelection(t.id)}
              autoEdit={pendingAutoEditTaskId === t.id}
              dragGroupIds={getDragGroupRootIds(t.id)}
            />
            {StaticSubtreeRows({
              parentId: t.id,
              depth: 0,
              incompleteSubtasks,
              makeRowClick,
              makeSelection,
              openCompleteWithLog,
              onEnterCreateSibling: handleEnterCreateSibling,
              pendingAutoEditTaskId,
              subtaskNestNoDrag,
            })}
          </div>
        ))}
      </div>
    ))
  ) : (
    active.map((t) => (
      <div key={t.id}>
        <TaskItem
          task={t}
          onRowClick={makeRowClick(t.id)}
          onCompleteRequest={openCompleteWithLog}
          onEnterCreateSibling={handleEnterCreateSibling}
          selection={makeSelection(t.id)}
          autoEdit={pendingAutoEditTaskId === t.id}
          dragGroupIds={getDragGroupRootIds(t.id)}
        />
        {StaticSubtreeRows({
          parentId: t.id,
          depth: 0,
          incompleteSubtasks,
          makeRowClick,
          makeSelection,
          openCompleteWithLog,
          onEnterCreateSibling: handleEnterCreateSibling,
          pendingAutoEditTaskId,
          subtaskNestNoDrag,
        })}
      </div>
    ))
  )

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2 px-4 pb-2 pt-6 md:px-6 md:pt-8">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
              {title}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-xs text-zinc-400 dark:text-zinc-500">
                {t('taskList.incompleteTasks', { count: incompleteCount })}
              </p>
              {filterTag && (
                <button
                  onClick={() => setFilterTag(null)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-md
                             bg-accent-50 dark:bg-accent-500/10 text-accent-600 dark:text-accent-400
                             hover:bg-accent-100 dark:hover:bg-accent-500/20 transition-colors"
                >
                  {filterTag}
                  <CloseIcon className="w-3 h-3" strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
            {selectedList && selectedList.id !== INBOX_LIST_ID && <ListKindPicker list={selectedList} />}
            {selectedListId && sortMode === 'manual' && (
              <button
                type="button"
                onClick={() => {
                  const sectionId = addSectionStore(selectedListId)
                  beginSectionRename(sectionId, '')
                }}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-600
                           text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                {t('taskList.addSection')}
              </button>
            )}
            <div className="relative">
            <button
              onClick={() => setShowSort(!showSort)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg
                         text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5-4.5L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
              </svg>
              {sortOptions.find((o) => o.value === sortMode)?.label}
            </button>
            {showSort && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowSort(false)} />
                <div className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-zinc-800 rounded-lg shadow-lg
                                border border-zinc-200 dark:border-zinc-700 py-1 min-w-[120px]">
                  {sortOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => { setSortMode(opt.value); setShowSort(false) }}
                      className={`w-full text-left px-3 py-1.5 text-xs transition-colors
                        ${sortMode === opt.value
                          ? 'text-accent-600 dark:text-accent-400 bg-accent-50 dark:bg-accent-500/10'
                          : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700'}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
            </div>
          </div>
        </div>

        {selected.size > 0 && (
          <div className="mx-4 mb-2 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/90 dark:bg-zinc-800/80
                          flex flex-wrap items-center gap-2 text-xs text-zinc-700 dark:text-zinc-200">
            <span className="font-medium text-zinc-600 dark:text-zinc-300 mr-1">{t('taskList.selectedCount', { count: selected.size })}</span>
            <button
              type="button"
              onClick={bulkComplete}
              className="px-2 py-1 rounded-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-700"
            >
              {t('taskList.markComplete')}
            </button>
            <button
              type="button"
              onClick={bulkArchive}
              className="px-2 py-1 rounded-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-700"
            >
              {t('taskList.bulkArchive')}
            </button>
            <button
              type="button"
              onClick={bulkDelete}
              className="px-2 py-1 rounded-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-600 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400"
            >
              {t('taskList.bulkDelete')}
            </button>
            <label className="inline-flex items-center gap-1">
              <span className="text-zinc-500 dark:text-zinc-400">{t('common.list')}</span>
              <select
                className="max-w-[140px] rounded-md border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-1.5 py-1 text-xs"
                value=""
                onChange={(e) => {
                  const listId = e.target.value
                  e.target.value = ''
                  if (!listId) return
                  bulkUpdateTasks(selectedIds, { listId })
                }}
              >
                <option value="">{t('taskList.moveEllipsis')}</option>
                {sortedLists.map((l) => (
                  <option key={l.id} value={l.id}>{displayListName(l.id, l.name)}</option>
                ))}
              </select>
            </label>
            <label className="inline-flex items-center gap-1">
              <span className="text-zinc-500 dark:text-zinc-400">{t('common.priority')}</span>
              <select
                className="rounded-md border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-1.5 py-1 text-xs"
                value=""
                onChange={(e) => {
                  const v = e.target.value as Priority | ''
                  e.target.value = ''
                  if (!v) return
                  bulkUpdateTasks(selectedIds, { priority: v })
                }}
              >
                <option value="">{t('taskList.priorityEllipsis')}</option>
                {bulkPriorityOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="inline-flex items-center gap-1">
              <span className="text-zinc-500 dark:text-zinc-400">{t('common.due')}</span>
              <input
                type="date"
                className="rounded-md border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-1 py-0.5 text-xs w-[118px]"
                onChange={(e) => {
                  const v = e.target.value
                  e.target.value = ''
                  if (!v) return
                  bulkUpdateTasks(selectedIds, { dueDate: v })
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => bulkUpdateTasks(selectedIds, { dueDate: null })}
              className="px-2 py-1 rounded-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-700"
            >
              {t('taskList.noDue')}
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="px-2 py-1 rounded-md text-zinc-500 dark:text-zinc-400 hover:underline"
            >
              {t('taskList.clearSelection')}
            </button>
          </div>
        )}

        <div className="flex-1 px-4 pb-4 space-y-0.5">
          {showQuickAdd && (
            <div className="mb-1.5">
              <QuickAdd />
            </div>
          )}

          {incompleteCount === 0 && !showQuickAdd && (
            <div className="py-16 text-center">
              <svg className="w-16 h-16 mx-auto text-zinc-200 dark:text-zinc-700 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-zinc-400 dark:text-zinc-500">{t('taskList.allDoneTitle')}</p>
              <p className="text-xs text-zinc-300 dark:text-zinc-600 mt-1">{t('taskList.allDoneSubtitle')}</p>
            </div>
          )}

          {activeContent}

          {completedTodos.length > 0 && (
            <details className="pt-4">
              <summary className="text-xs font-medium text-zinc-400 dark:text-zinc-500 cursor-pointer select-none px-4 py-2">
                {t('taskList.completedHeader', { count: completedTodos.length })}
              </summary>
              <div className="space-y-0.5 mt-1">
                {completedTodos.map((t) => (
                  <div key={t.id}>
                    <TaskItem
                      task={t}
                      onRowClick={makeRowClick(t.id)}
                      onCompleteRequest={openCompleteWithLog}
                      onEnterCreateSibling={handleEnterCreateSibling}
                      selection={makeSelection(t.id)}
                      autoEdit={pendingAutoEditTaskId === t.id}
                    />
                    {CompletedSubtreeRows({
                      parentId: t.id,
                      depth: 0,
                      childrenByParent,
                      makeRowClick,
                      makeSelection,
                      openCompleteWithLog,
                      onEnterCreateSibling: handleEnterCreateSibling,
                      pendingAutoEditTaskId,
                      subtaskNestNoDrag,
                    })}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>

      {detailTask ? <TaskDetail task={detailTask} onClose={closeDetail} /> : null}
      {completionDraft && (
        <CompleteWithLogModal
          draft={completionDraft}
          radioGroupName="completion-mode"
          onClose={() => setCompletionDraft(null)}
          onChange={(patch) => setCompletionDraft((prev) => (prev ? { ...prev, ...patch } : prev))}
          onSubmit={submitCompleteWithLog}
        />
      )}
    </div>
  )
}
