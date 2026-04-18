import { AccountMenu } from './components/AccountMenu'
import { useSupabaseSync } from './hooks/useSupabaseSync'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useTaskStore } from './store/taskStore'
import { Sidebar, LIST_PREFIX } from './components/Sidebar'
import { TaskList } from './components/TaskList'
import { TASK_PREFIX } from './components/SortableTaskItem'
import { CalendarView } from './components/CalendarView'
import { WeekCalendarView } from './components/WeekCalendarView'
import { PlanVsActualView } from './components/PlanVsActualView'
import { StatsView } from './components/StatsView'
import { ActivityLogView } from './components/ActivityLogView.tsx'
import { HabitsView } from './components/HabitsView'
import { SettingsView } from './components/SettingsView'
import { FloatingTimer } from './components/FloatingTimer.tsx'
import { SearchResults } from './components/SearchResults'
import { ThemeToggle } from './components/ThemeToggle'
import { UndoToast } from './components/UndoToast.tsx'
import { requestPermission, checkAndNotify } from './lib/notifications'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent, DragOverlay } from '@dnd-kit/core'

export default function App() {
  useSupabaseSync()

  const theme = useTaskStore((s) => s.theme)
  const selectedView = useTaskStore((s) => s.selectedView)
  const searchQuery = useTaskStore((s) => s.searchQuery)
  const setSearchQuery = useTaskStore((s) => s.setSearchQuery)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [dragLabel, setDragLabel] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setDragLabel(null)
    const { active, over } = event
    if (!over || active.id === over.id) return
    const activeId = active.id as string
    const overId = over.id as string

    if (activeId.startsWith(TASK_PREFIX) && overId.startsWith(TASK_PREFIX)) {
      const state = useTaskStore.getState()
      const tasks = state.tasks.filter((t) => t.parentId === null && !t.completed)
        .sort((a, b) => a.order - b.order)
      const ids = tasks.map((t) => `${TASK_PREFIX}${t.id}`)
      const oldIndex = ids.indexOf(activeId)
      const newIndex = ids.indexOf(overId)
      if (oldIndex < 0 || newIndex < 0) return
      const reordered = [...ids]
      reordered.splice(oldIndex, 1)
      reordered.splice(newIndex, 0, activeId)
      state.reorderTasks(reordered.map((id) => id.slice(TASK_PREFIX.length)))
    } else if (activeId.startsWith(TASK_PREFIX) && overId.startsWith('drop::')) {
      const taskId = activeId.slice(TASK_PREFIX.length)
      const listId = overId.slice('drop::'.length)
      useTaskStore.getState().updateTask(taskId, { listId })
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

  const handleDragStart = useCallback((event: { active: { id: string | number } }) => {
    const id = event.active.id as string
    if (id.startsWith(TASK_PREFIX)) {
      const taskId = id.slice(TASK_PREFIX.length)
      const task = useTaskStore.getState().tasks.find((t) => t.id === taskId)
      setDragLabel(task?.title ?? null)
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

  const mainContent = (() => {
    if (searchQuery.trim()) return <SearchResults />
    switch (selectedView) {
      case 'calendar': return <CalendarView />
      case 'week-calendar': return <WeekCalendarView />
      case 'plan-vs-actual': return <PlanVsActualView />
      case 'activity-log': return <ActivityLogView />
      case 'stats': return <StatsView />
      case 'habits': return <HabitsView />
      case 'settings': return <SettingsView />
      default: return <TaskList />
    }
  })()

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} onDragStart={handleDragStart}>
      <div className="h-screen min-h-0 flex overflow-hidden bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-sans">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          <header className="flex-shrink-0 flex items-center gap-3 px-4 md:px-6 py-3 border-b border-zinc-200 dark:border-zinc-800">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-2 -ml-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <svg className="w-5 h-5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>

            <div className="flex-1 max-w-md relative">
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
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700"
                >
                  <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            <AccountMenu />
            <ThemeToggle />
          </header>

          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {mainContent}
          </div>
        </div>

        <UndoToast />
        <FloatingTimer />
      </div>

      <DragOverlay>
        {dragLabel && (
          <div className="px-4 py-2.5 bg-white dark:bg-zinc-800 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-800 dark:text-zinc-200 max-w-xs truncate">
            {dragLabel}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
