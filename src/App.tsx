import { useSupabaseSync } from './hooks/useSupabaseSync'
import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from './i18n/config'
import { displayListName } from './lib/displayListName'
import { useTaskStore } from './store/taskStore'
import { Sidebar, LIST_PREFIX } from './components/Sidebar'
import { TaskList } from './components/TaskList'
import { TASK_PREFIX, type TaskRootDragData } from './components/SortableTaskItem'
import { CalendarHubView } from './components/CalendarHubView'
import { PlanVsActualView } from './components/PlanVsActualView'
import { StatsView } from './components/StatsView'
import { ActivityLogView } from './components/ActivityLogView.tsx'
import { HabitsView } from './components/HabitsView'
import { SettingsView } from './components/SettingsView'
import { FloatingTimer } from './components/FloatingTimer.tsx'
import { SearchResults } from './components/SearchResults'
import { UndoToast } from './components/UndoToast.tsx'
import { MoveToast } from './components/MoveToast'
import { DndTaskDragShell, MOBILE_DROP_PREFIX } from './components/DndTaskDragShell'
import { TaskItem } from './components/TaskItem'
import { requestPermission, checkAndNotify } from './lib/notifications'
import {
  buildReorderedActiveRootIdsForGroup,
  getOrderedActiveRootTasksForDnD,
  parseSectionDropId,
  SECTION_DROP_PREFIX,
} from './lib/mainListTasks'
import {
  DRAGSEC_PREFIX,
  DROPSEC_PREFIX,
  parseSectionReorderId,
} from './lib/sectionReorderDnD'
import {
  NEST_DROP_PREFIX,
  SUBTASK_PREFIX,
  nestDropId,
  parseNestDropId,
  parseSubtaskDragId,
} from './lib/subtaskDnD'
import { isModKey, isTextFieldUndoTarget } from './lib/keyboard'
import { isTodoSurfaceView } from './lib/todoSurfaceView'
import { canNestUnder } from './lib/taskDepth'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  pointerWithin,
  rectIntersection,
  PointerSensor,
  useSensor,
  useSensors,
  useDndMonitor,
  type DragStartEvent,
  type DragEndEvent,
  type DragCancelEvent,
  type CollisionDetection,
} from '@dnd-kit/core'
import type { Task } from './types/task'

/** ドロップ行の右寄り＝ネスト意図（`nest::` が衝突に載らない環境向け） */
const lastDragClientRef: { current: { x: number; y: number } | null } = { current: null }
const NEST_BAND_RATIO = 0.42
const NEST_LOWER_HALF_RATIO = 0.42

function isPointerInNestBand(
  clientX: number,
  rect: { left: number; width: number },
  ratio = NEST_BAND_RATIO,
): boolean {
  return clientX >= rect.left + rect.width * ratio
}

function isPointerInLowerHalf(
  clientY: number,
  rect: { top: number; height: number },
  ratio = NEST_LOWER_HALF_RATIO,
): boolean {
  return clientY >= rect.top + rect.height * ratio
}

function isPointerInNestIntent(
  pointer: { x: number; y: number },
  rect: { left: number; width: number; top: number; height: number },
): boolean {
  return isPointerInNestBand(pointer.x, rect) && isPointerInLowerHalf(pointer.y, rect)
}

function isPointerInNestIntentForRoot(
  pointer: { x: number; y: number },
  rect: { left: number; width: number; top: number; height: number },
  overHasChildren: boolean,
): boolean {
  const relaxedRight = pointer.x >= rect.left + 80
  const relaxedLower = isPointerInLowerHalf(pointer.y, rect, overHasChildren ? 0.38 : 0.32)
  return relaxedRight && relaxedLower
}

function pickNestDropCollisionId(collisions: DragEndEvent['collisions']): string | null {
  if (!collisions?.length) return null
  const hit = collisions.find((c) => String(c.id).startsWith(NEST_DROP_PREFIX))
  return hit ? String(hit.id) : null
}

/** 同一行に `task::` と `nest::` が両方載るとき、`over` が task のみでも衝突列に nest があればネストに寄せる */
function preferNestWhenCoListed(
  activeId: string,
  overId: string,
  collisions: DragEndEvent['collisions'],
  activeData: TaskRootDragData | undefined,
): string {
  if (activeData?.dragGroupRootIds && activeData.dragGroupRootIds.length > 1) return overId
  if (!collisions?.length) return overId
  if (!(activeId.startsWith(TASK_PREFIX) || activeId.startsWith(SUBTASK_PREFIX))) return overId
  if (!overId.startsWith(TASK_PREFIX)) return overId
  const rootId = overId.slice(TASK_PREFIX.length)
  const nestId = nestDropId(rootId)
  return collisions.some((c) => String(c.id) === nestId) ? nestId : overId
}

/** セクション見出し行の dropsec が広いとタスクの pointerWithin で先に拾われ、並べ替え・リスト移動が壊れる */
const taskListCollision: CollisionDetection = (args) => {
  const activeId = String(args.active.id)
  const fromPointer = pointerWithin(args)

  if (activeId.startsWith(TASK_PREFIX) || activeId.startsWith(SUBTASK_PREFIX)) {
    if (fromPointer.length > 0) {
      const rank = activeId.startsWith(SUBTASK_PREFIX) ? rankForSubtaskDrag : rankForTaskDrag
      return [...fromPointer].sort((a, b) => rank(String(a.id)) - rank(String(b.id)))
    }
    const fromRect = rectIntersection(args)
    const nestHits = fromRect.filter((c) => String(c.id).startsWith(NEST_DROP_PREFIX))
    if (nestHits.length > 0) {
      const bestNest = nestHits[0]
      const rank = activeId.startsWith(SUBTASK_PREFIX) ? rankForSubtaskDrag : rankForTaskDrag
      const rest = closestCenter(args).filter((c) => c.id !== bestNest.id)
      return [bestNest, ...rest.sort((a, b) => rank(String(a.id)) - rank(String(b.id)))]
    }
  }

  const base = fromPointer.length > 0 ? fromPointer : closestCenter(args)

  if (activeId.startsWith(TASK_PREFIX)) {
    return [...base].sort((a, b) => rankForTaskDrag(String(a.id)) - rankForTaskDrag(String(b.id)))
  }
  if (activeId.startsWith(SUBTASK_PREFIX)) {
    return [...base].sort((a, b) => rankForSubtaskDrag(String(a.id)) - rankForSubtaskDrag(String(b.id)))
  }
  if (activeId.startsWith(DRAGSEC_PREFIX)) {
    return [...base].sort((a, b) => rankForSectionReorderDrag(String(a.id)) - rankForSectionReorderDrag(String(b.id)))
  }
  if (activeId.startsWith(LIST_PREFIX)) {
    return [...base].sort((a, b) => rankForListReorderDrag(String(a.id)) - rankForListReorderDrag(String(b.id)))
  }
  return base
}

function rankForTaskDrag(id: string): number {
  if (id.startsWith(NEST_DROP_PREFIX)) return 0
  if (id.startsWith(TASK_PREFIX)) return 1
  if (id.startsWith(SECTION_DROP_PREFIX)) return 2
  if (id.startsWith('drop::') || id.startsWith(LIST_PREFIX) || id.startsWith('mobile-drop::')) return 3
  if (id.startsWith(DROPSEC_PREFIX)) return 20
  return 10
}

/** サブタスクDnD: ネスト帯・兄弟行をルート行より優先 */
function rankForSubtaskDrag(id: string): number {
  if (id.startsWith(NEST_DROP_PREFIX)) return 0
  if (id.startsWith(SUBTASK_PREFIX)) return 1
  if (id.startsWith(TASK_PREFIX)) return 2
  if (id.startsWith(SECTION_DROP_PREFIX)) return 3
  if (id.startsWith('drop::') || id.startsWith(LIST_PREFIX) || id.startsWith('mobile-drop::')) return 4
  if (id.startsWith(DROPSEC_PREFIX)) return 20
  return 10
}

function rankForSectionReorderDrag(id: string): number {
  if (id.startsWith(DROPSEC_PREFIX)) return 0
  return 10
}

function rankForListReorderDrag(id: string): number {
  if (id.startsWith(LIST_PREFIX)) return 0
  if (id.startsWith('drop::')) return 1
  return 10
}

function DragOverlayTaskRow({ task, isSubtask }: { task: Task; isSubtask: boolean }) {
  return (
    <div className="w-[min(640px,calc(100vw-2rem))] rounded-xl bg-white dark:bg-zinc-900 shadow-lg ring-1 ring-zinc-200/70 dark:ring-zinc-700/70">
      <TaskItem task={task} isSubtask={isSubtask} />
    </div>
  )
}

/** `useDndMonitor` は `<DndContext>` の子ツリー内でのみ有効 */
function DndPointerBridge({ trackDragPointer }: { trackDragPointer: (e: PointerEvent) => void }) {
  useDndMonitor(
    useMemo(
      () => ({
        onDragStart() {
          lastDragClientRef.current = null
          window.addEventListener('pointermove', trackDragPointer, { capture: true, passive: true })
          window.addEventListener('pointerup', trackDragPointer, { capture: true })
          window.addEventListener('pointercancel', trackDragPointer, { capture: true })
        },
        onDragEnd() {
          window.removeEventListener('pointermove', trackDragPointer, { capture: true })
          window.removeEventListener('pointerup', trackDragPointer, { capture: true })
          window.removeEventListener('pointercancel', trackDragPointer, { capture: true })
        },
        onDragCancel() {
          window.removeEventListener('pointermove', trackDragPointer, { capture: true })
          window.removeEventListener('pointerup', trackDragPointer, { capture: true })
          window.removeEventListener('pointercancel', trackDragPointer, { capture: true })
        },
      }),
      [trackDragPointer],
    ),
  )
  return null
}

export default function App() {
  const { t } = useTranslation()
  useSupabaseSync()

  const theme = useTaskStore((s) => s.theme)
  const selectedView = useTaskStore((s) => s.selectedView)
  const tasks = useTaskStore((s) => s.tasks)
  const searchQuery = useTaskStore((s) => s.searchQuery)
  const setSearchQuery = useTaskStore((s) => s.setSearchQuery)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [dragOverlayTask, setDragOverlayTask] = useState<{ taskId: string; isSubtask: boolean } | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const trackDragPointer = useCallback((e: PointerEvent) => {
    lastDragClientRef.current = { x: e.clientX, y: e.clientY }
  }, [])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const activeId = String(event.active.id)
    if (activeId.startsWith(TASK_PREFIX)) {
      setDragOverlayTask({ taskId: activeId.slice(TASK_PREFIX.length), isSubtask: false })
      return
    }
    if (activeId.startsWith(SUBTASK_PREFIX)) {
      const taskId = parseSubtaskDragId(activeId)
      setDragOverlayTask(taskId ? { taskId, isSubtask: true } : null)
      return
    }
    setDragOverlayTask(null)
  }, [])

  const handleDragCancel = useCallback((_: DragCancelEvent) => {
    setDragOverlayTask(null)
  }, [])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setDragOverlayTask(null)
    const { active, over, collisions } = event
    if (!over || active.id === over.id) {
      return
    }
    const activeId = active.id as string
    const overId = preferNestWhenCoListed(
      activeId,
      over.id as string,
      collisions,
      active.data.current as TaskRootDragData | undefined,
    )

    if (activeId.startsWith(DRAGSEC_PREFIX) && overId.startsWith(DROPSEC_PREFIX)) {
      const a = parseSectionReorderId(activeId, DRAGSEC_PREFIX)
      const b = parseSectionReorderId(overId, DROPSEC_PREFIX)
      if (!a || !b || a.listId !== b.listId) return
      if (a.sectionId === b.sectionId) return
      const state = useTaskStore.getState()
      const sorted = state.sections
        .filter((s) => s.listId === a.listId)
        .sort((x, y) => x.order - y.order)
        .map((s) => s.id)
      const from = sorted.indexOf(a.sectionId)
      const to = sorted.indexOf(b.sectionId)
      if (from < 0 || to < 0) return
      const next = [...sorted]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      state.reorderSections(a.listId, next)
    } else if (activeId.startsWith(SUBTASK_PREFIX)) {
      const movedTaskId = parseSubtaskDragId(activeId)
      if (!movedTaskId) return
      const state = useTaskStore.getState()
      const moved = state.tasks.find((t) => t.id === movedTaskId)
      if (!moved?.parentId) return

      if (overId.startsWith(NEST_DROP_PREFIX)) {
        const parentId = parseNestDropId(overId)
        if (!parentId) return
        const parent = state.tasks.find((t) => t.id === parentId)
        if (!parent) return
        state.moveSubtaskInList(movedTaskId, parentId, null)
      } else if (overId.startsWith(SUBTASK_PREFIX)) {
        const overTaskId = parseSubtaskDragId(overId)
        if (!overTaskId) return
        const overTask = state.tasks.find((t) => t.id === overTaskId)
        if (!overTask?.parentId) return

        const nestCollisionId = pickNestDropCollisionId(collisions)
        if (nestCollisionId) {
          const collisionParentId = parseNestDropId(nestCollisionId)
          if (
            collisionParentId &&
            movedTaskId !== collisionParentId &&
            canNestUnder(state.tasks, movedTaskId, collisionParentId)
          ) {
            state.moveSubtaskInList(movedTaskId, collisionParentId, null)
            return
          }
        }

        const ptr = lastDragClientRef.current
        if (
          ptr &&
          isPointerInNestIntent(ptr, over.rect) &&
          movedTaskId !== overTaskId &&
          canNestUnder(state.tasks, movedTaskId, overTaskId)
        ) {
          state.moveSubtaskInList(movedTaskId, overTaskId, null)
        } else {
          state.moveSubtaskInList(movedTaskId, overTask.parentId, overTaskId)
        }
      } else if (overId.startsWith(TASK_PREFIX)) {
        const rootId = overId.slice(TASK_PREFIX.length)
        const root = state.tasks.find((t) => t.id === rootId)
        if (!root) return
        state.moveSubtaskInList(movedTaskId, rootId, null)
      }
    } else if (activeId.startsWith(TASK_PREFIX) && overId.startsWith(NEST_DROP_PREFIX)) {
      const group = (active.data.current as TaskRootDragData | undefined)?.dragGroupRootIds
      if (group && group.length > 1) return
      const taskId = activeId.slice(TASK_PREFIX.length)
      const parentId = parseNestDropId(overId)
      if (!parentId || taskId === parentId) return
      const state = useTaskStore.getState()
      const moved = state.tasks.find((t) => t.id === taskId)
      if (!moved || moved.parentId != null) return
      state.nestRootUnderParent(taskId, parentId, null)
    } else if (activeId.startsWith(TASK_PREFIX) && overId.startsWith(SUBTASK_PREFIX)) {
      const group = (active.data.current as TaskRootDragData | undefined)?.dragGroupRootIds
      if (group && group.length > 1) return
      const taskId = activeId.slice(TASK_PREFIX.length)
      const overTaskId = parseSubtaskDragId(overId)
      if (!overTaskId) return
      const state = useTaskStore.getState()
      const moved = state.tasks.find((t) => t.id === taskId)
      const overTask = state.tasks.find((t) => t.id === overTaskId)
      if (!moved || moved.parentId != null || !overTask) return
      const ptr = lastDragClientRef.current
      if (
        ptr &&
        isPointerInNestIntent(ptr, over.rect) &&
        taskId !== overTaskId &&
        canNestUnder(state.tasks, taskId, overTaskId)
      ) {
        state.nestRootUnderParent(taskId, overTaskId, null)
        return
      }
      const fallbackParentId = overTask.parentId
      if (!fallbackParentId || !canNestUnder(state.tasks, taskId, fallbackParentId)) {
        return
      }
      state.nestRootUnderParent(taskId, fallbackParentId, overTaskId)
    } else if (
      activeId.startsWith(TASK_PREFIX) &&
      (overId.startsWith(TASK_PREFIX) ||
        parseSectionDropId(overId) ||
        parseSectionReorderId(overId, DROPSEC_PREFIX))
    ) {
      const state = useTaskStore.getState()
      const taskId = activeId.slice(TASK_PREFIX.length)
      const group =
        (active.data.current as TaskRootDragData | undefined)?.dragGroupRootIds ?? [taskId]

      if (
        overId.startsWith(TASK_PREFIX) &&
        activeId !== overId &&
        group.length === 1
      ) {
        const overTaskId = overId.slice(TASK_PREFIX.length)
        const moved = state.tasks.find((t) => t.id === taskId)
        const overHasChildren = state.tasks.some((t) => t.parentId === overTaskId)
        const ptr = lastDragClientRef.current
        const intent = ptr ? isPointerInNestIntentForRoot(ptr, over.rect, overHasChildren) : false
        const canNest = canNestUnder(state.tasks, taskId, overTaskId)
        if (
          moved?.parentId == null &&
          ptr &&
          intent &&
          taskId !== overTaskId &&
          canNest
        ) {
          state.nestRootUnderParent(taskId, overTaskId, null)
          return
        }
      }

      const currentOrdered = getOrderedActiveRootTasksForDnD({
        tasks: state.tasks,
        selectedView: state.selectedView,
        selectedListId: state.selectedListId,
        sortMode: state.sortMode,
        filterTag: state.filterTag,
        sections: state.sections,
        todayIncludeOverdue: state.todayIncludeOverdue,
      })
      const built = buildReorderedActiveRootIdsForGroup(
        currentOrdered,
        taskId,
        overId,
        group,
        state.sections,
        state.selectedListId,
      )
      if (built) {
        state.reorderManualRootTasks(built.orderedIds, built.sectionUpdate)
      }
    } else if (activeId.startsWith(TASK_PREFIX)) {
      // サイドバー行は useSortable が list:: を、別途 useDroppable が drop:: を同じノードに登録する。
      // 衝突判定では list:: が選ばれることが多いので両方扱う。
      let listId: string | null = null
      if (overId.startsWith('drop::')) listId = overId.slice('drop::'.length)
      else if (overId.startsWith(MOBILE_DROP_PREFIX)) listId = overId.slice(MOBILE_DROP_PREFIX.length)
      else if (overId.startsWith(LIST_PREFIX)) listId = overId.slice(LIST_PREFIX.length)
      if (listId) {
        const taskId = activeId.slice(TASK_PREFIX.length)
        const group =
          (active.data.current as TaskRootDragData | undefined)?.dragGroupRootIds ?? [taskId]
        const { moveTaskToList, moveTasksToList, showMoveBanner } = useTaskStore.getState()
        const r =
          group.length > 1 ? moveTasksToList(group, listId) : moveTaskToList(taskId, listId)
        if (r.moved && r.listName && r.listId != null) {
          showMoveBanner(
            i18n.t('toast.taskMovedToList', {
              name: displayListName(r.listId, r.listName),
            }),
          )
        }
      }
    } else if (activeId.startsWith(LIST_PREFIX) && overId.startsWith(LIST_PREFIX)) {
      const state = useTaskStore.getState()
      const sorted = [...state.lists].sort((a, b) => a.order - b.order)
      const ids = sorted.map((l) => `${LIST_PREFIX}${l.id}`)
      const oldIndex = ids.indexOf(activeId)
      const newIndex = ids.indexOf(overId)
      if (oldIndex < 0 || newIndex < 0) return
      const reordered = [...ids]
      reordered.splice(oldIndex, 1)
      reordered.splice(newIndex, 0, activeId)
      state.reorderLists(reordered.map((id) => id.slice(LIST_PREFIX.length)))
    }
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (isModKey(e) && e.key === 'k') {
      e.preventDefault()
      searchRef.current?.focus()
    }
    if (isModKey(e) && e.key === 'n') {
      e.preventDefault()
      const quickAdd = document.querySelector<HTMLElement>('[data-quickadd]')
      if (quickAdd) {
        quickAdd.click()
      } else {
        useTaskStore.getState().requestQuickAdd()
      }
    }
    if (isModKey(e) && e.key === 'z' && !e.shiftKey) {
      if (isTextFieldUndoTarget(e.target)) return
      const state = useTaskStore.getState()
      if (state.undoLastOperation()) {
        e.preventDefault()
        return
      }
      if (state.deletedTasks.length > 0) {
        e.preventDefault()
        state.undoDelete()
      }
    }
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const notificationsEnabled = useTaskStore((s) => s.notificationsEnabled)
  useEffect(() => {
    if (!notificationsEnabled) return
    requestPermission().then((granted) => {
      if (granted) checkAndNotify(useTaskStore.getState().tasks)
    })
    const id = setInterval(() => {
      checkAndNotify(useTaskStore.getState().tasks)
    }, 60_000)
    return () => clearInterval(id)
  }, [notificationsEnabled])

  const isTodoSurface = isTodoSurfaceView(selectedView)
  const hideGlobalHeader = !isTodoSurface && !searchQuery.trim()
  const showMobileChromeWhenHeaderHidden =
    hideGlobalHeader && selectedView !== 'calendar' && !searchQuery.trim()

  const mainContent = (() => {
    if (searchQuery.trim()) return <SearchResults />
    switch (selectedView) {
      case 'calendar': return <CalendarHubView onOpenSidebar={() => setSidebarOpen(true)} />
      case 'plan-vs-actual': return <PlanVsActualView />
      case 'activity-log': return <ActivityLogView />
      case 'stats': return <StatsView />
      case 'habits': return <HabitsView />
      case 'settings': return <SettingsView />
      default: return <TaskList />
    }
  })()

  const dragOverlayTaskEntity = useMemo(
    () => (dragOverlayTask ? tasks.find((task) => task.id === dragOverlayTask.taskId) ?? null : null),
    [dragOverlayTask, tasks],
  )

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={taskListCollision}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <DndPointerBridge trackDragPointer={trackDragPointer} />
      <div className="h-screen min-h-0 flex overflow-hidden bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-sans">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          {!hideGlobalHeader && (
            <header className="flex-shrink-0 flex items-center gap-3 px-4 md:px-6 py-3 border-b border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="md:hidden p-2 -ml-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <svg className="w-5 h-5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
              </button>

              <div className="relative min-w-0 flex-1 max-w-2xl">
                <svg
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400/45 dark:text-zinc-500/45"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.75}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <input
                  ref={searchRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('app.searchPlaceholder')}
                  className={`w-full rounded-full border border-zinc-200/55 bg-zinc-50/60 py-2.5 pl-10 text-sm text-zinc-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] outline-none backdrop-blur-sm transition-[background-color,border-color,box-shadow,color] duration-200 placeholder:text-zinc-400/55 focus:border-zinc-300/70 focus:bg-white/85 focus:shadow-[0_2px_8px_rgba(15,23,42,0.06)] focus:ring-2 focus:ring-zinc-900/[0.04] dark:border-zinc-700/35 dark:bg-zinc-950/35 dark:text-zinc-100 dark:shadow-none dark:placeholder:text-zinc-500/45 dark:focus:border-zinc-600/50 dark:focus:bg-zinc-900/45 dark:focus:ring-white/[0.06] ${searchQuery ? 'pr-10' : 'pr-4'}`}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-zinc-400/70 transition-colors hover:bg-zinc-200/50 hover:text-zinc-600 dark:text-zinc-500/60 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-300"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </header>
          )}

          {showMobileChromeWhenHeaderHidden && (
            <div className="flex flex-shrink-0 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800 md:hidden">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="-ml-1 shrink-0 rounded-lg p-2 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
                aria-label={t('app.openMenu')}
              >
                <svg className="h-5 w-5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
              </button>
            </div>
          )}

          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {mainContent}
          </div>
        </div>

        <UndoToast />
        <MoveToast />
        <FloatingTimer />
      </div>

      <DragOverlay dropAnimation={null}>
        {dragOverlayTaskEntity && dragOverlayTask ? (
          <DragOverlayTaskRow task={dragOverlayTaskEntity} isSubtask={dragOverlayTask.isSubtask} />
        ) : null}
      </DragOverlay>

      <DndTaskDragShell />
    </DndContext>
  )
}
