import { useSupabaseSync } from './hooks/useSupabaseSync'
import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from './i18n/config'
import { displayListName } from './lib/displayListName'
import { useTaskStore } from './store/taskStore'
import { Sidebar } from './components/Sidebar'
import { TodoNavPanel } from './components/TodoNavPanel'
import { LIST_PREFIX } from './lib/listDnD'
import { TaskList } from './components/TaskList'
import { TASK_PREFIX, type TaskRootDragData } from './components/SortableTaskItem'
import { CalendarHubView } from './components/CalendarHubView'
import { TodayPlannerView } from './components/TodayPlannerView'
import { PlanVsActualView } from './components/PlanVsActualView'
import { StatsView } from './components/StatsView'
import { ActivityLogView } from './components/ActivityLogView.tsx'
import { HabitsView } from './components/HabitsView'
import { TaskBinView } from './components/TaskBinView'
import { ChecklistView } from './components/ChecklistView'
import { SomedayView } from './components/SomedayView'
import { SettingsView } from './components/SettingsView'
import { FloatingTimer } from './components/FloatingTimer.tsx'
import { SearchResults } from './components/SearchResults'
import { UndoToast } from './components/UndoToast.tsx'
import { MoveToast } from './components/MoveToast'
import { DndTaskDragShell, MOBILE_DROP_PREFIX } from './components/DndTaskDragShell'
import { TaskItem } from './components/TaskItem'
import { requestPermission, checkAndNotify } from './lib/notifications'
import { checkDailyReminders } from './lib/dailyReminders'
import { checkEventReminders } from './lib/eventReminders'
import { isWebPushActive, syncWebPush } from './lib/webPush'
import { useAuth } from './contexts/AuthContext'
import { getDayPlan } from './lib/dayPlan'
import { unplannedListIds } from './lib/listKind'
import { format } from 'date-fns'
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
  SUBTASK_PREFIX,
  parseSubtaskDragId,
} from './lib/subtaskDnD'
import { isModKey, isTextFieldUndoTarget } from './lib/keyboard'
import { dispatchNav, isTypingTarget } from './lib/shortcuts'
import { ShortcutsHelp } from './components/ShortcutsHelp'
import { isTodoNavView, isTodoSurfaceView } from './lib/todoSurfaceView'
import { useIsLargeScreen } from './hooks/useMediaQuery'
import { canNestUnder } from './lib/taskDepth'
import { isIndentIntent, isOutdentIntent } from './lib/taskDragIntent'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  pointerWithin,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type CollisionDetection,
} from '@dnd-kit/core'
import type { Task } from './types/task'
import { MobileBottomNav } from './components/MobileBottomNav'

/** セクション見出し行の dropsec が広いとタスクの pointerWithin で先に拾われ、並べ替え・リスト移動が壊れる */
const taskListCollision: CollisionDetection = (args) => {
  const activeId = String(args.active.id)
  const fromPointer = pointerWithin(args)

  if (activeId.startsWith(TASK_PREFIX) || activeId.startsWith(SUBTASK_PREFIX)) {
    if (fromPointer.length > 0) {
      const rank = activeId.startsWith(SUBTASK_PREFIX) ? rankForSubtaskDrag : rankForTaskDrag
      return [...fromPointer].sort((a, b) => rank(String(a.id)) - rank(String(b.id)))
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
  if (id.startsWith(TASK_PREFIX)) return 1
  if (id.startsWith(SECTION_DROP_PREFIX)) return 2
  if (id.startsWith('drop::') || id.startsWith(LIST_PREFIX) || id.startsWith('mobile-drop::')) return 3
  if (id.startsWith(DROPSEC_PREFIX)) return 20
  return 10
}

/** サブタスクDnD: 兄弟行をルート行より優先 */
function rankForSubtaskDrag(id: string): number {
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

function DragOverlayTaskRow({ task, isSubtask, count }: { task: Task; isSubtask: boolean; count: number }) {
  const { t } = useTranslation()
  const isMulti = count > 1
  return (
    <div className="relative w-[min(640px,calc(100vw-2rem))]">
      {isMulti && (
        <>
          <div className="absolute inset-x-2 -bottom-2 h-full rounded-xl bg-white dark:bg-zinc-900 shadow-lg ring-1 ring-zinc-200/70 dark:ring-zinc-700/70" />
          <div className="absolute inset-x-1 -bottom-1 h-full rounded-xl bg-white dark:bg-zinc-900 shadow-lg ring-1 ring-zinc-200/70 dark:ring-zinc-700/70" />
        </>
      )}
      <div className="relative rounded-xl bg-white dark:bg-zinc-900 shadow-lg ring-1 ring-zinc-200/70 dark:ring-zinc-700/70">
        <TaskItem task={task} isSubtask={isSubtask} />
        {isMulti && (
          <span className="absolute -right-2 -top-2 inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-semibold text-white shadow-md dark:bg-zinc-100 dark:text-zinc-900">
            {t('taskList.dragCount', { count })}
          </span>
        )}
      </div>
    </div>
  )
}

export default function App() {
  const { t } = useTranslation()
  useSupabaseSync()

  const theme = useTaskStore((s) => s.theme)
  const selectedView = useTaskStore((s) => s.selectedView)
  const tasks = useTaskStore((s) => s.tasks)
  const searchQuery = useTaskStore((s) => s.searchQuery)
  const selectedList = useTaskStore((s) => (s.selectedListId ? s.lists.find((l) => l.id === s.selectedListId) ?? null : null))
  const setSearchQuery = useTaskStore((s) => s.setSearchQuery)
  const isLargeScreen = useIsLargeScreen()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [dragOverlayTask, setDragOverlayTask] = useState<{ taskId: string; isSubtask: boolean; count: number } | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 280, tolerance: 8 } }),
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const activeId = String(event.active.id)
    const group = (event.active.data.current as TaskRootDragData | undefined)?.dragGroupRootIds
    const count = group && group.length > 1 ? group.length : 1
    if (activeId.startsWith(TASK_PREFIX)) {
      setDragOverlayTask({ taskId: activeId.slice(TASK_PREFIX.length), isSubtask: false, count })
      return
    }
    if (activeId.startsWith(SUBTASK_PREFIX)) {
      const taskId = parseSubtaskDragId(activeId)
      setDragOverlayTask(taskId ? { taskId, isSubtask: true, count: 1 } : null)
      return
    }
    setDragOverlayTask(null)
  }, [])

  const handleDragCancel = useCallback(() => {
    setDragOverlayTask(null)
  }, [])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setDragOverlayTask(null)
    const { active, over } = event
    const activeId = String(active.id)

    // 水平方向のドラッグでインデント/アウトデント（アウトライナー風）。
    // over が自分自身でも成立させたいので、通常の over 判定より前に処理する。
    if (activeId.startsWith(TASK_PREFIX) || activeId.startsWith(SUBTASK_PREFIX)) {
      const group = (active.data.current as TaskRootDragData | undefined)?.dragGroupRootIds
      const isMultiGroup = !!group && group.length > 1
      const movedId = activeId.startsWith(SUBTASK_PREFIX)
        ? parseSubtaskDragId(activeId)
        : activeId.slice(TASK_PREFIX.length)
      if (movedId && !isMultiGroup) {
        const state = useTaskStore.getState()

        // 右ドラッグ = 1 段下げる（直前の兄弟の子に）
        if (isIndentIntent(event.delta)) {
          if (state.indentTaskUnderPrevSibling(movedId)) return
        }

        // 左ドラッグ = 1 段上げる（サブタスクのみ）
        if (isOutdentIntent(event.delta) && activeId.startsWith(SUBTASK_PREFIX)) {
          const moved = state.tasks.find((t) => t.id === movedId)
          const parent = moved?.parentId
            ? state.tasks.find((t) => t.id === moved.parentId)
            : null
          if (moved?.parentId && parent) {
            if (parent.parentId != null) {
              // 親もサブタスク → 祖父母の直下（旧親の直後）へ
              const gpChildren = state.tasks
                .filter((t) => t.parentId === parent.parentId && t.id !== movedId)
                .sort((a, b) => a.order - b.order)
                .map((t) => t.id)
              const parentIdx = gpChildren.indexOf(parent.id)
              const insertBefore = parentIdx >= 0 ? gpChildren[parentIdx + 1] ?? null : null
              state.moveSubtaskInList(movedId, parent.parentId, insertBefore)
            } else {
              // 親がルート → ルートへ昇格
              state.promoteSubtaskToRoot(movedId)
            }
            return
          }
        }
      }
    }

    if (!over || active.id === over.id) {
      return
    }
    const overId = over.id as string

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

      if (overId.startsWith(SUBTASK_PREFIX)) {
        const overTaskId = parseSubtaskDragId(overId)
        if (!overTaskId) return
        const overTask = state.tasks.find((t) => t.id === overTaskId)
        if (!overTask?.parentId) return
        // 縦の並べ替え: ドロップ先サブタスクと同じ親・同じ位置に差し込む
        state.moveSubtaskInList(movedTaskId, overTask.parentId, overTaskId)
      } else if (overId.startsWith(TASK_PREFIX)) {
        const rootId = overId.slice(TASK_PREFIX.length)
        const root = state.tasks.find((t) => t.id === rootId)
        if (!root) return
        state.moveSubtaskInList(movedTaskId, rootId, null)
      }
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
      // 縦の並べ替え: ルートをドロップ先サブタスクと同じ親・同じ位置の兄弟にする
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

      const currentOrdered = getOrderedActiveRootTasksForDnD({
        tasks: state.tasks,
        selectedView: state.selectedView,
        selectedListId: state.selectedListId,
        sortMode: state.sortMode,
        filterTag: state.filterTag,
        sections: state.sections,
        listOrderById: new Map(state.lists.map((l) => [l.id, l.order])),
        excludedListIds: unplannedListIds(state.lists),
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
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    const apply = () =>
      document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && media?.matches === true))
    apply()
    if (theme !== 'system' || !media) return
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // 1 文字ショートカット（Google カレンダー風）。入力中・修飾キー付き・ダイアログ表示中は無視
    if (!isModKey(e) && !e.altKey && !isTypingTarget(e.target) && !document.querySelector('[role="dialog"]')) {
      const store = useTaskStore.getState()
      const focusQuickAdd = () => {
        const el = document.querySelector<HTMLElement>('[data-quickadd]')
        if (el instanceof HTMLInputElement) el.focus()
        else el?.click()
        return Boolean(el)
      }
      const handled = (() => {
        switch (e.key) {
          case 't': dispatchNav('today'); return true
          case 'j': case 'n': dispatchNav('next'); return true
          case 'k': case 'p': dispatchNav('prev'); return true
          case 'd': store.selectView('planner'); return true
          case 'w': store.setCalendarMode('week'); store.selectView('calendar'); return true
          case 'm': store.setCalendarMode('month'); store.selectView('calendar'); return true
          case 'l': store.selectView('activity-log'); return true
          case 'c':
            if (!focusQuickAdd()) {
              store.selectView('planner')
              window.setTimeout(focusQuickAdd, 50)
            }
            return true
          case '/':
            if (searchRef.current) searchRef.current.focus()
            else {
              store.selectView('all')
              window.setTimeout(() => searchRef.current?.focus(), 50)
            }
            return true
          case '?': setShowShortcuts(true); return true
          default: return false
        }
      })()
      if (handled) {
        e.preventDefault()
        return
      }
    }
    if (isModKey(e) && e.key === 'k') {
      e.preventDefault()
      searchRef.current?.focus()
    }
    if (isModKey(e) && e.key === 'n') {
      e.preventDefault()
      const quickAdd = document.querySelector<HTMLElement>('[data-quickadd]')
      if (quickAdd instanceof HTMLInputElement) {
        quickAdd.focus()
      } else if (quickAdd) {
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
    if (isModKey(e) && (e.key === 'z' || e.key === 'Z') && e.shiftKey) {
      if (isTextFieldUndoTarget(e.target)) return
      if (useTaskStore.getState().redoLastOperation()) {
        e.preventDefault()
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
      if (granted) checkAndNotify(useTaskStore.getState().tasks, unplannedListIds(useTaskStore.getState().lists))
    })
    const id = setInterval(() => {
      checkAndNotify(useTaskStore.getState().tasks, unplannedListIds(useTaskStore.getState().lists))
    }, 60_000)
    return () => clearInterval(id)
  }, [notificationsEnabled])

  // 朝の計画・夕方の締めの通知（タスク期限通知のオン/オフとは独立）
  const dailyReminders = useTaskStore((s) => s.dailyReminders)
  const { user } = useAuth()
  const userId = user?.id ?? null
  // ログイン中は Web Push（閉じていても届く）に購読。使えない環境では下のローカル通知だけ
  const eventReminderMinutes = useTaskStore((s) => s.eventReminderMinutes)
  useEffect(() => {
    void syncWebPush(userId, dailyReminders, eventReminderMinutes, i18n.resolvedLanguage ?? 'ja')
  }, [userId, dailyReminders, eventReminderMinutes])
  // 予定の開始前通知（タブが開いている間。Web Push が有効ならサーバー側が送る）
  useEffect(() => {
    if (eventReminderMinutes == null) return
    const tick = () => {
      if (isWebPushActive()) return
      const state = useTaskStore.getState()
      checkEventReminders(state.tasks, eventReminderMinutes, unplannedListIds(state.lists), () =>
        useTaskStore.getState().selectView('planner'),
      )
    }
    tick()
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [eventReminderMinutes])
  useEffect(() => {
    if (!dailyReminders.planTime && !dailyReminders.wrapUpTime) return
    const tick = () => {
      if (isWebPushActive()) return
      const state = useTaskStore.getState()
      checkDailyReminders(state.dailyReminders, {
        remainingToday: getDayPlan(state.tasks, format(new Date(), 'yyyy-MM-dd'), unplannedListIds(state.lists)).open.length,
        onOpen: () => useTaskStore.getState().selectView('planner'),
      })
    }
    tick()
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [dailyReminders])

  const isTodoSurface = isTodoSurfaceView(selectedView)
  const hideGlobalHeader = !isTodoSurface && !searchQuery.trim()
  // 細い To‑Do パネルは lg 以上のみ。それ未満は置く幅がないのでサイドバー内に畳み込む
  const showTodoNavPanel = isLargeScreen && isTodoNavView(selectedView)

  const mainContent = (() => {
    if (searchQuery.trim()) return <SearchResults />
    switch (selectedView) {
      case 'planner': return <TodayPlannerView />
      case 'calendar': return <CalendarHubView onOpenSidebar={() => setSidebarOpen(true)} />
      case 'plan-vs-actual': return <PlanVsActualView />
      case 'activity-log': return <ActivityLogView />
      case 'stats': return <StatsView />
      case 'habits': return <HabitsView />
      case 'archived': return <TaskBinView mode="archived" />
      case 'deleted': return <TaskBinView mode="deleted" />
      case 'settings': return <SettingsView />
      default:
        // いつか・チェックリストのリストは専用画面（日付や優先度を出さない）
        if (selectedView == null && selectedList?.kind === 'checklist') return <ChecklistView list={selectedList} />
        if (selectedView == null && selectedList?.kind === 'someday') return <SomedayView list={selectedList} />
        return <TaskList />
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
      <div className="h-dvh min-h-0 flex overflow-hidden bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-sans">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {showTodoNavPanel ? <TodoNavPanel /> : null}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
          {!hideGlobalHeader && (
            <header className="flex-shrink-0 flex items-center gap-3 px-4 md:px-6 py-3 border-b border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="md:hidden p-2.5 -ml-1 rounded-lg touch-manipulation hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
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

          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {mainContent}
          </div>
        </div>

        {showShortcuts && <ShortcutsHelp onClose={() => setShowShortcuts(false)} />}
        <UndoToast />
        <MoveToast />
        <FloatingTimer />
        <MobileBottomNav
          onOpenMore={() => setSidebarOpen(true)}
          onNavigate={() => setSidebarOpen(false)}
        />
      </div>

      <DragOverlay dropAnimation={null}>
        {dragOverlayTaskEntity && dragOverlayTask ? (
          <DragOverlayTaskRow
            task={dragOverlayTaskEntity}
            isSubtask={dragOverlayTask.isSubtask}
            count={dragOverlayTask.count}
          />
        ) : null}
      </DragOverlay>

      <DndTaskDragShell />
    </DndContext>
  )
}
