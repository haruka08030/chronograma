import { useSupabaseSync } from './hooks/useSupabaseSync'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useTaskStore } from './store/taskStore'
import { Sidebar, LIST_PREFIX } from './components/Sidebar'
import { TaskList } from './components/TaskList'
import { TASK_PREFIX } from './components/SortableTaskItem'
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
import { requestPermission, checkAndNotify } from './lib/notifications'
import {
  buildReorderedActiveRootIds,
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
  DndContext,
  closestCenter,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type CollisionDetection,
} from '@dnd-kit/core'

/** セクション見出し行の dropsec が広いとタスクの pointerWithin で先に拾われ、並べ替え・リスト移動が壊れる */
const taskListCollision: CollisionDetection = (args) => {
  const activeId = String(args.active.id)
  const fromPointer = pointerWithin(args)
  const base = fromPointer.length > 0 ? fromPointer : closestCenter(args)

  if (activeId.startsWith(TASK_PREFIX)) {
    return [...base].sort((a, b) => rankForTaskDrag(String(a.id)) - rankForTaskDrag(String(b.id)))
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
  if (id.startsWith(TASK_PREFIX)) return 0
  if (id.startsWith(SECTION_DROP_PREFIX)) return 1
  if (id.startsWith('drop::') || id.startsWith(LIST_PREFIX) || id.startsWith('mobile-drop::')) return 2
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

export default function App() {
  useSupabaseSync()

  const theme = useTaskStore((s) => s.theme)
  const selectedView = useTaskStore((s) => s.selectedView)
  const searchQuery = useTaskStore((s) => s.searchQuery)
  const setSearchQuery = useTaskStore((s) => s.setSearchQuery)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const activeId = active.id as string
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
    } else if (
      activeId.startsWith(TASK_PREFIX) &&
      (overId.startsWith(TASK_PREFIX) ||
        parseSectionDropId(overId) ||
        parseSectionReorderId(overId, DROPSEC_PREFIX))
    ) {
      const state = useTaskStore.getState()
      const currentOrdered = getOrderedActiveRootTasksForDnD({
        tasks: state.tasks,
        selectedView: state.selectedView,
        selectedListId: state.selectedListId,
        sortMode: state.sortMode,
        filterTag: state.filterTag,
        sections: state.sections,
      })
      const built = buildReorderedActiveRootIds(
        currentOrdered,
        activeId,
        overId,
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
        const { moveTaskToList, showMoveBanner } = useTaskStore.getState()
        const r = moveTaskToList(taskId, listId)
        if (r.moved && r.listName) showMoveBanner(`「${r.listName}」に移動しました`)
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
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      searchRef.current?.focus()
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
      e.preventDefault()
      const quickAdd = document.querySelector<HTMLElement>('[data-quickadd]')
      if (quickAdd) {
        quickAdd.click()
      } else {
        useTaskStore.getState().requestQuickAdd()
      }
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
      const state = useTaskStore.getState()
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

  const isTodoSurface =
    selectedView === null ||
    selectedView === 'all' ||
    selectedView === 'today' ||
    selectedView === 'upcoming'
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

  return (
    <DndContext sensors={sensors} collisionDetection={taskListCollision} onDragEnd={handleDragEnd}>
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
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <input
                  ref={searchRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="検索… (⌘K)"
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-zinc-100 dark:bg-zinc-800
                             border border-transparent focus:border-accent-400 focus:ring-1 focus:ring-accent-400/40
                             outline-none text-zinc-900 dark:text-zinc-100
                             placeholder:text-zinc-400 dark:placeholder:text-zinc-500 transition-all"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700"
                  >
                    <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
                aria-label="メニューを開く"
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

      <DndTaskDragShell />
    </DndContext>
  )
}
