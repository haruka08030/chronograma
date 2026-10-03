import { useMemo, useState, useRef, useEffect, useCallback, type ReactNode, type MouseEvent } from 'react'
import { useDismiss } from '../hooks/useDismiss'
import { INVERSE_SURFACE, POPOVER_PANEL } from './ui/surface'
import { useTranslation } from 'react-i18next'
import { useDndMonitor, useDroppable, type DragCancelEvent, type DragEndEvent, type DragMoveEvent, type DragStartEvent } from '@dnd-kit/core'
import { useTaskStore, INBOX_LIST_ID, type SortMode } from '../store/taskStore'
import type { SectionGroupingScope } from '../store/storeTypes'
import { unplannedListIds } from '../lib/listKind'
import { ListKindPicker } from './ListKindPicker'
import {
  getFilteredRootTasks,
  getOrderedActiveRootTasksForDnD,
  sectionDropId,
} from '../lib/mainListTasks'
import { isListedTimeLog } from '../lib/timeLogTask'
import { isActiveTask } from '../lib/taskLifecycle'
import { groupsBySection, isTodoSurfaceView } from '../lib/todoSurfaceView'
import { displayListName } from '../lib/displayListName'
import { colorLabelText } from '../lib/todoColorLabels'
import { isModKey, isSubmitEnter } from '../lib/keyboard'
import { isTypingTarget, useSelectAllShortcut } from '../lib/shortcuts'
import { SortableTaskItem, TASK_PREFIX, type TaskRootDragData } from './SortableTaskItem'
import { SortableSubtaskItem } from './SortableSubtaskItem'
import { SUBTASK_PREFIX, parseSubtaskDragId, subtaskDragId } from '../lib/subtaskDnD'
import { isIndentIntent } from '../lib/taskDragIntent'
import { getIndentTargetId } from '../lib/taskDepth'
import { SectionHeaderDnD } from './SectionHeaderDnD'
import { SECTION_HEADING_TEXT } from './ListSectionHeading'
import { useSectionScrollTarget } from '../hooks/useSectionScrollTarget'
import { DRAGSEC_PREFIX } from '../lib/sectionReorderDnD'
import { TaskItem, type TaskItemSelection } from './TaskItem'
import { TaskDetail } from './TaskDetail'
import { TaskContextMenu } from './TaskContextMenu'
import { QuickAdd } from './QuickAdd'
import type { Task } from '../types/task'
import { useCompleteWithLog } from '../hooks/useCompleteWithLog'
import { useBulkTaskActions } from '../hooks/useBulkTaskActions'
import { useTaskDetailModal } from '../hooks/useTaskDetailModal'
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CheckCircleIcon, CheckIcon, CloseIcon, PencilIcon, SortIcon } from './icons'
import { Switch } from './settings/SettingsPrimitives'
import { buttonClass } from './ui/buttonClass'

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

export function TaskList() {
  const { t } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const selectedListId = useTaskStore((s) => s.selectedListId)
  const selectedView = useTaskStore((s) => s.selectedView)
  const lists = useTaskStore((s) => s.lists)
  const sortMode = useTaskStore((s) => s.sortMode)
  const sectionGrouping = useTaskStore((s) => s.sectionGrouping)
  const setSectionGrouping = useTaskStore((s) => s.setSectionGrouping)
  const setSortMode = useTaskStore((s) => s.setSortMode)
  const filterTag = useTaskStore((s) => s.filterTag)
  const filterColor = useTaskStore((s) => s.filterColor)
  const setFilterTag = useTaskStore((s) => s.setFilterTag)
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const addTaskAfter = useTaskStore((s) => s.addTaskAfter)
  const deleteTasks = useTaskStore((s) => s.deleteTasks)
  const sections = useTaskStore((s) => s.sections)
  const addSectionStore = useTaskStore((s) => s.addSection)
  const renameSectionStore = useTaskStore((s) => s.renameSection)
  const deleteSectionStore = useTaskStore((s) => s.deleteSection)
  const setQuickAddSectionId = useTaskStore((s) => s.setQuickAddSectionId)
  const quickAddSectionId = useTaskStore((s) => s.quickAddSectionId)
  const { detailTask, openDetail, closeDetail } = useTaskDetailModal(tasks)
  const [showSort, setShowSort] = useState(false)
  const sortMenuRef = useRef<HTMLDivElement>(null)
  useDismiss({ open: showSort, onClose: () => setShowSort(false), inside: [sortMenuRef] })
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null)
  const [editingSectionName, setEditingSectionName] = useState('')
  /** 「＋ セクション」で開いた名前入力。名前が決まるまでセクションは作らない */
  const [draftSectionListId, setDraftSectionListId] = useState<string | null>(null)
  const [draftSectionName, setDraftSectionName] = useState('')
  const [pendingAutoEditTaskId, setPendingAutoEditTaskId] = useState<string | null>(null)
  const [previewParentId, setPreviewParentId] = useState<string | null>(null)
  const previewParentIdRef = useRef<string | null>(null)
  const selectedRef = useRef(selected)
  const lastAnchorRef = useRef<string | null>(null)
  /** ↑↓ で動かす行。枠はキーで動かしている間だけ出す（マウスで押した行も覚えて、そこから続ける） */
  const [cursorId, setCursorId] = useState<string | null>(null)
  const [cursorVisible, setCursorVisible] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; taskIds: string[]; above?: boolean } | null>(null)

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
    queueMicrotask(() => {
      clearSelection()
      setCursorId(null)
      setCursorVisible(false)
    })
  }, [selectedListId, selectedView, filterTag, filterColor, sortMode, clearSelection])

  useEffect(() => {
    queueMicrotask(() => {
      setEditingSectionId(null)
      setEditingSectionName('')
      setDraftSectionListId(null)
      setDraftSectionName('')
    })
  }, [selectedListId, selectedView])

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
  const presets = useTaskStore((s) => s.timeLogTagPresets)
  const categoryColors = useTaskStore((s) => s.logCategoryColors)
  // ナビから色ラベルを開いたとき（「すべて」を色で絞る）はラベル名を見出しにする
  const colorView = selectedView === 'all' && filterColor !== null
  const title = colorView
    ? colorLabelText(filterColor, presets, categoryColors, t)
    : selectedView
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
        filterColor,
        sections,
        excludedListIds,
      }),
    [tasks, selectedView, selectedListId, sortMode, filterTag, filterColor, sections, excludedListIds],
  )

  const listSectionsOrdered = useMemo(() => {
    if (!selectedListId) return []
    return sections.filter((s) => s.listId === selectedListId).sort((a, b) => a.order - b.order)
  }, [sections, selectedListId])

  // リスト選択時はそのリストのセクション。スマートビューでは、表示対象タスクが属する
  // リストにセクションがあるとき、リスト横断でセクションブロックを出す。
  const multiListSectionMode = !selectedListId && isTodoSurfaceView(selectedView)
  /** 手動以外の並び順でセクションの塊を出すか。リストはリストごと、「すべて」は lists、今日・近日中・期限切れは dueViews */
  const groupingScope: SectionGroupingScope = selectedListId
    ? { listId: selectedListId }
    : selectedView === 'all' || selectedView === null ? 'lists' : 'dueViews'
  const groupBySection = groupsBySection(sortMode, sectionGrouping, groupingScope)
  const showSectionBlocks = useMemo(() => {
    if (!groupBySection) return false
    if (selectedListId) return listSectionsOrdered.length > 0
    if (!multiListSectionMode || sections.length === 0) return false
    const listIds = new Set(
      filtered.filter((t) => !t.completed && !isListedTimeLog(t)).map((t) => t.listId),
    )
    return sections.some((s) => listIds.has(s.listId))
  }, [groupBySection, selectedListId, listSectionsOrdered.length, multiListSectionMode, sections, filtered])

  /** 塊で分けないとき、行に出すセクション名 */
  const sectionNameById = useMemo(() => new Map(sections.map((s) => [s.id, s.name])), [sections])
  const sectionLabelFor = (task: { sectionId: string | null }) =>
    !groupBySection && task.sectionId ? sectionNameById.get(task.sectionId) ?? null : null

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
      filterColor,
      sections,
      listOrderById,
      excludedListIds,
    })
  }, [filtered, showSectionBlocks, tasks, selectedView, selectedListId, sortMode, filterTag, filterColor, sections, listOrderById, excludedListIds])

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

  const { open: openCompleteWithLog, modal: completeWithLogModal } = useCompleteWithLog()

  const handleEnterCreateSibling = useCallback((task: Task) => {
    const newTaskId = addTaskAfter(task.id, '')
    if (!newTaskId) return
    setPendingAutoEditTaskId(newTaskId)
    queueMicrotask(() => {
      setPendingAutoEditTaskId((prev) => (prev === newTaskId ? null : prev))
    })
  }, [addTaskAfter])

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
      setCursorId(taskId)
      setCursorVisible(false)
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
      cursor: cursorVisible && cursorId === taskId,
      onContextMenu: (e) => {
        setCursorId(taskId)
        setCursorVisible(false)
        // 選択中の行なら選択中のすべてに、それ以外はその行だけに効かせる
        const ids = selected.has(taskId) && selected.size > 1 ? [...selected] : [taskId]
        setContextMenu({ x: e.clientX, y: e.clientY, taskIds: ids })
      },
    }),
    [selected, toggleInSelection, cursorVisible, cursorId],
  )

  // ⌘A: 表示中の未完了のタスクをすべて選ぶ（そのまま一括操作のバーが出る）
  useSelectAllShortcut(() => {
    if (flatActiveIds.length === 0) return false
    setSelected(new Set(flatActiveIds))
    lastAnchorRef.current = flatActiveIds[flatActiveIds.length - 1]
    return true
  })

  const bulk = useBulkTaskActions()
  const bulkComplete = useCallback(() => {
    bulk.complete([...selected])
    clearSelection()
  }, [selected, bulk, clearSelection])

  const bulkDelete = useCallback(() => {
    if (selected.size === 0) return
    deleteTasks([...selected])
    clearSelection()
  }, [selected, deleteTasks, clearSelection])

  // 完了・削除などで枠の行が一覧から消えたら、同じ位置の行（末尾なら前の行）へ移す
  const cursorIndexRef = useRef(-1)
  useEffect(() => {
    if (!cursorId) return
    const i = flatActiveIds.indexOf(cursorId)
    if (i >= 0) {
      cursorIndexRef.current = i
      return
    }
    const fallback = flatActiveIds[Math.min(cursorIndexRef.current, flatActiveIds.length - 1)] ?? null
    queueMicrotask(() => setCursorId(fallback))
  }, [cursorId, flatActiveIds])

  const completeByKey = useCallback((taskId: string) => {
    const task = tasks.find((x) => x.id === taskId)
    if (!task) return
    // 丸を押したときと同じ: 未完了の To-Do は「記録して完了」を開く
    if (!task.completed && !isListedTimeLog(task)) {
      openCompleteWithLog(task)
      return
    }
    toggleTask(taskId)
  }, [tasks, openCompleteWithLog, toggleTask])

  /**
   * 一覧のキー操作（入力中・ダイアログ表示中は除く）
   * - ↑↓ で行を動く、Shift+↑↓ で選択を広げる、Enter で詳細、Space で完了
   * - 選択中（なければ枠の行）: Delete で削除、⌘Enter で完了、Esc で解除
   */
  const listKeysRef = useRef({ clearSelection, bulkComplete, bulkDelete, completeByKey, openDetail, deleteTasks, toggleTask, flatActiveIds, cursorId, cursorVisible })
  useEffect(() => {
    listKeysRef.current = { clearSelection, bulkComplete, bulkDelete, completeByKey, openDetail, deleteTasks, toggleTask, flatActiveIds, cursorId, cursorVisible }
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.altKey) return
      if (isTypingTarget(document.activeElement) || document.querySelector('[role="dialog"], [role="menu"]')) return
      const k = listKeysRef.current
      const hasSelection = selectedRef.current.size > 0
      const cursor = k.cursorId && k.flatActiveIds.includes(k.cursorId) ? k.cursorId : null
      // 削除・完了・詳細は枠が見えている行にだけ効かせる（見えない行を消さない）
      const target = k.cursorVisible ? cursor : null
      const onButton = document.activeElement instanceof HTMLButtonElement || document.activeElement?.getAttribute('role') === 'button'

      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !isModKey(e)) {
        const ids = k.flatActiveIds
        if (ids.length === 0) return
        const i = cursor ? ids.indexOf(cursor) : -1
        const next = i < 0
          ? (e.key === 'ArrowDown' ? ids[0] : ids[ids.length - 1])
          : ids[Math.min(ids.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))]
        if (e.shiftKey) {
          setSelected((prev) => new Set([...prev, ...(cursor ? [cursor] : []), next]))
          lastAnchorRef.current = next
        }
        setCursorId(next)
        setCursorVisible(true)
      } else if (e.key === 'Escape') {
        if (hasSelection) k.clearSelection()
        else if (target) setCursorVisible(false)
        else return
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (hasSelection) k.bulkDelete()
        else if (target) k.deleteTasks([target])
        else return
      } else if (e.key === 'Enter' && isModKey(e)) {
        if (hasSelection) k.bulkComplete()
        else if (target) k.toggleTask(target)
        else return
      } else if ((e.key === '/' && isModKey(e)) || e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
        // ⌘/（Notion と同じ）: 選択中（なければ枠の行）の右クリックメニューを、その行の下に開く
        const ids = hasSelection ? [...selectedRef.current] : target ? [target] : []
        if (ids.length === 0) return
        const anchor = (target && ids.includes(target) ? target : ids[0])
        const row = document.querySelector(`[data-task-row="${anchor}"]`)?.getBoundingClientRect()
        if (!row) return
        setContextMenu({ x: row.left + 48, y: row.bottom + 4, taskIds: ids })
      } else if (e.key === 'Enter' && !onButton && target) {
        k.openDetail(target)
      } else if (e.key === ' ' && !onButton && target) {
        k.completeByKey(target)
      } else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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

  const finishDraftSection = useCallback(() => {
    const name = draftSectionName.trim()
    if (draftSectionListId && name) addSectionStore(draftSectionListId, name)
    setDraftSectionListId(null)
    setDraftSectionName('')
  }, [draftSectionListId, draftSectionName, addSectionStore])

  const cancelDraftSection = useCallback(() => {
    setDraftSectionListId(null)
    setDraftSectionName('')
  }, [])

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

  /** セクション名。押すとそこへ追加、ダブルクリックか鉛筆で名前を変える。手動でも並べ替え中でも同じ */
  const sectionTitle = (sectionId: string, title: string, canQuickTarget: boolean) =>
    editingSectionId === sectionId ? (
      <SectionNameInput
        value={editingSectionName}
        onChange={setEditingSectionName}
        onCommit={() => finishSectionRename(sectionId, title)}
        onCancel={() => cancelSectionRename(sectionId)}
      />
    ) : (
      <button
        type="button"
        className={`w-full text-left ${SECTION_HEADING_TEXT} truncate`}
        onClick={() => {
          if (canQuickTarget) setQuickAddSectionId(sectionId)
        }}
        // 名前の変更: PC はダブルクリックか、ホバーで出る鉛筆。スマホは鉛筆（リストと同じ）
        onDoubleClick={() => beginSectionRename(sectionId, title)}
      >
        {title}
      </button>
    )

  /** セクションの鉛筆（名前の変更）と × （削除）。PC はホバーで出す */
  const sectionActions = (sectionId: string, title: string) => (
    <span
      className="flex items-center gap-0.5 shrink-0 md:opacity-0 md:focus-within:opacity-100 md:group-hover:opacity-100"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="p-1 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
        title={t('sections.renameTitle')}
        onClick={() => beginSectionRename(sectionId, title)}
      >
        <PencilIcon className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        className="p-1 rounded text-zinc-400 hover:text-red-500"
        title={t('common.delete')}
        onClick={() => deleteSectionStore(sectionId)}
      >
        <CloseIcon className="w-3.5 h-3.5" />
      </button>
    </span>
  )

  useSectionScrollTarget(sectionBlocks)

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
            <div key={blockKey} data-section-anchor={sectionId ?? undefined} className="relative scroll-mt-2 pt-3 first:pt-1">
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
                  titleButton={sectionTitle(sectionId, block.title, canQuickTarget)}
                  actions={sectionActions(sectionId, block.title)}
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
                        : SECTION_HEADING_TEXT
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
    // 並べ替え中もセクションはそのまま。並び順は各セクションの中だけに効かせ、名前の変更・削除もできる。
    // 空の「セクションなし」は手動のときのドロップ先なので、並べ替え中は出さない
    sectionBlocks.filter((block) => block.headerKind !== 'section-none' || block.tasks.length > 0).map((block) => (
      <div
        key={`${block.listId}::${block.sectionId ?? 'none'}::${block.headerKind}`}
        data-section-anchor={block.sectionId ?? undefined}
        className="relative scroll-mt-2 pt-3 first:pt-1"
      >
        {block.listTitle ? (
          <div className="px-3 pb-1 pt-1 text-xs font-semibold tracking-tight text-zinc-700 dark:text-zinc-200">
            {block.listTitle}
          </div>
        ) : null}
        {block.headerKind === 'section-named' && block.sectionId !== null ? (
          <div className="group relative z-10 flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg mb-0.5 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800/60">
            <div className="min-w-0 flex-1">
              {sectionTitle(block.sectionId, block.title, Boolean(selectedListId) && selectedListId === block.listId)}
            </div>
            {sectionActions(block.sectionId, block.title)}
          </div>
        ) : (
        <button
          type="button"
          className={`relative z-10 w-full text-left px-3 py-1.5 mb-0.5 rounded-lg bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 ${
            block.headerKind === 'list-only'
              ? 'text-xs font-semibold tracking-tight text-zinc-700 dark:text-zinc-200'
              : SECTION_HEADING_TEXT
          }`}
          onClick={() => {
            if (selectedListId === block.listId) {
              setQuickAddSectionId(block.sectionId === null ? '' : block.sectionId)
            }
          }}
        >
          {block.title}
        </button>
        )}
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
          sectionLabel={sectionLabelFor(t)}
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
        {/* 見出しは下のリスト（「タスクを追加」の＋・行の頭）と同じ 32px にそろえる */}
        <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2 px-8 pb-2 pt-6 md:pt-8">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2.5 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
              {colorView && (
                <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: filterColor }} aria-hidden />
              )}
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
            {selectedListId && (
              <button
                type="button"
                onClick={() => {
                  setDraftSectionListId(selectedListId)
                  setDraftSectionName('')
                }}
                className={buttonClass({ variant: 'secondary', size: 'sm' })}
              >
                {t('taskList.addSection')}
              </button>
            )}
            <div ref={sortMenuRef} className="relative">
            <button
              type="button"
              aria-expanded={showSort}
              onClick={() => setShowSort(!showSort)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg
                         text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <SortIcon className="w-3.5 h-3.5" />
              {sortOptions.find((o) => o.value === sortMode)?.label}
            </button>
            {showSort && (
              <>
                {/* 見出しの whitespace-nowrap を受け継いで項目が横一列にならないよう、縦に積む */}
                <div role="menu" className={`absolute right-0 top-full z-20 mt-1 flex min-w-40 flex-col py-1 ${POPOVER_PANEL}`}>
                  {sortOptions.map((opt) => {
                    const selected = sortMode === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="menuitemradio"
                        aria-checked={selected}
                        onClick={() => { setSortMode(opt.value); setShowSort(false) }}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-700
                          ${selected ? 'font-medium text-zinc-900 dark:text-zinc-100' : 'text-zinc-600 dark:text-zinc-300'}`}
                      >
                        <CheckIcon className={`h-4 w-4 shrink-0 ${selected ? 'text-accent-600 dark:text-accent-400' : 'invisible'}`} />
                        {opt.label}
                      </button>
                    )
                  })}
                  {/* 手動はセクションの中で並べ替えるものなので、分けるかどうかを選ぶのは手動以外のときだけ */}
                  {sortMode !== 'manual' && (
                    <>
                      <div className="my-1 border-t border-zinc-100 dark:border-zinc-700" />
                      {/* 並び順（どれか 1 つ）とは別の、オン/オフの設定なのでスイッチにする。切り替えてもメニューは閉じない */}
                      <div className="flex items-center justify-between gap-3 px-3 py-2">
                        <span
                          className="cursor-pointer select-none text-sm text-zinc-600 dark:text-zinc-300"
                          onClick={() => setSectionGrouping(groupingScope, !groupBySection)}
                        >
                          {t('taskList.groupBySection')}
                        </span>
                        <Switch
                          checked={groupBySection}
                          onChange={(on) => setSectionGrouping(groupingScope, on)}
                          label={t('taskList.groupBySection')}
                        />
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
            </div>
          </div>
        </div>

        <div className="flex-1 px-4 pb-4 space-y-0.5">
          {showQuickAdd && (
            <div className="mb-1.5">
              <QuickAdd />
            </div>
          )}

          {incompleteCount === 0 && !showQuickAdd && (
            <div className="py-16 text-center">
              <CheckCircleIcon className="w-16 h-16 mx-auto text-zinc-200 dark:text-zinc-700 mb-4" strokeWidth={1} />
              <p className="text-sm text-zinc-400 dark:text-zinc-500">{t('taskList.allDoneTitle')}</p>
              <p className="text-xs text-zinc-300 dark:text-zinc-600 mt-1">{t('taskList.allDoneSubtitle')}</p>
            </div>
          )}

          {activeContent}

          {draftSectionListId && draftSectionListId === selectedListId && (
            <div className="relative pt-3">
              <div className="flex items-center px-3 py-1.5 rounded-lg mb-0.5 bg-white dark:bg-zinc-900">
                <SectionNameInput
                  value={draftSectionName}
                  onChange={setDraftSectionName}
                  onCommit={finishDraftSection}
                  onCancel={cancelDraftSection}
                />
              </div>
            </div>
          )}

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
      {completeWithLogModal}
      {contextMenu && (
        <TaskContextMenu
          {...contextMenu}
          onClose={() => setContextMenu(null)}
          onDone={clearSelection}
          onOpenDetail={openDetail}
        />
      )}
      {/* タップの端末だけ: 右クリックの代わりに、選択中の件数と「操作」を下に出す（PC は右クリック・キーで操作する） */}
      {selected.size > 0 && (
        <div className="fixed bottom-[calc(3.5rem+0.75rem+env(safe-area-inset-bottom))] left-1/2 z-40 -translate-x-1/2 md:bottom-6 [@media(hover:hover)]:hidden">
          <div className={`flex items-center gap-1 rounded-full py-1 pl-4 pr-1 text-sm ${INVERSE_SURFACE}`}>
            <span className="whitespace-nowrap">{t('taskList.selectedCount', { count: selected.size })}</span>
            <button
              type="button"
              className="rounded-full px-3 py-1.5 font-semibold touch-manipulation"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                setContextMenu({ x: r.left, y: r.top, taskIds: [...selected], above: true })
              }}
            >
              {t('taskMenu.actions')}
            </button>
            <button
              type="button"
              aria-label={t('taskList.clearSelection')}
              className="rounded-full p-2 touch-manipulation"
              onClick={clearSelection}
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** セクション名の入力（新規・名前変更で共通）。Enter・フォーカス外しで確定、Esc で取り消し */
function SectionNameInput({ value, onChange, onCommit, onCancel }: {
  value: string
  onChange: (value: string) => void
  onCommit: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  return (
    <input
      autoFocus
      value={value}
      placeholder={t('sections.defaultName')}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={onCommit}
      onKeyDown={(e) => {
        if (isSubmitEnter(e)) {
          e.preventDefault()
          e.currentTarget.blur()
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        }
      }}
      className={`w-full rounded bg-transparent text-left ${SECTION_HEADING_TEXT} focus:outline-none focus:ring-1 focus:ring-accent-400/50`}
    />
  )
}
