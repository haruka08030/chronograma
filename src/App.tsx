import { useSupabaseSync } from './hooks/useSupabaseSync'
import { useAutoBackup } from './hooks/useAutoBackup'
import { useNotionSync } from './hooks/useNotionSync'
import { useCanvasSync } from './hooks/useCanvasSync'
import { Suspense, useState, useRef } from 'react'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { OverlaySuspense } from './components/ui/OverlaySuspense'
import { lazyNamed } from './lib/lazyComponent'
import { useTaskStore } from './store/taskStore'
import { Sidebar } from './components/Sidebar'
import { TodoNavPanel } from './components/TodoNavPanel'
import { TodayPlannerView } from './components/TodayPlannerView'
import { FloatingTimer } from './components/FloatingTimer.tsx'
import { UndoToast } from './components/UndoToast.tsx'
import { MoveToast } from './components/MoveToast'
import { StorageFullBanner } from './components/StorageFullBanner'
import { DndTaskDragShell } from './components/DndTaskDragShell'
import { TimerDropZone } from './components/TimerDropZone'
import { TooltipHost } from './components/ui/Tooltip'
import { OverlayHost } from './components/OverlayHost'
import { SearchBox } from './components/SearchBox'
import { DragOverlayTaskRow } from './components/DragOverlayTaskRow'
import { MobileBottomNav } from './components/MobileBottomNav'
import { RecordPromptHost } from './components/RecordPromptHost'
import { isTodoNavView, isTodoSurfaceView } from './lib/todoSurfaceView'
import { taskListCollision } from './lib/dndCollision'
import { useIsDesktop, useIsLargeScreen } from './hooks/useMediaQuery'
import { useSwipeNav } from './hooks/useSwipeNav'
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts'
import { useShortcutsHelpRequest } from './lib/shortcuts'
import { useAppDnd } from './hooks/useAppDnd'
import { useAppTheme } from './hooks/useAppTheme'
import { useReminders } from './hooks/useReminders'
import { useFollowToday } from './hooks/useFollowToday'
import { DndContext, DragOverlay } from '@dnd-kit/core'

// 最初に開く「今日の計画」以外の画面は、開いたときに読み込む（最初の読み込みを軽くする）
const CalendarHubView = lazyNamed(() => import('./components/CalendarHubView'), 'CalendarHubView')
const StatsView = lazyNamed(() => import('./components/StatsView'), 'StatsView')
const HabitsView = lazyNamed(() => import('./components/HabitsView'), 'HabitsView')
const TaskBinView = lazyNamed(() => import('./components/TaskBinView'), 'TaskBinView')
const CompletedTasksView = lazyNamed(() => import('./components/CompletedTasksView'), 'CompletedTasksView')
const SettingsView = lazyNamed(() => import('./components/SettingsView'), 'SettingsView')
const TaskList = lazyNamed(() => import('./components/TaskList'), 'TaskList')
const SearchResults = lazyNamed(() => import('./components/SearchResults'), 'SearchResults')
const ShortcutsHelp = lazyNamed(() => import('./components/ShortcutsHelp'), 'ShortcutsHelp')

/** 離したときの動き。速さと動き方は他の出入りと同じ（index.css の --ease-standard） */
const DROP_ANIMATION = { duration: 150, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }

export default function App() {
  // 同期より先に呼ぶ（その日の控えを、サーバーの内容が反映される前に取る）
  useAutoBackup()
  useSupabaseSync()
  useNotionSync()
  useCanvasSync()
  useAppTheme()

  const selectedView = useTaskStore((s) => s.selectedView)
  const searchQuery = useTaskStore((s) => s.searchQuery)
  const selectedList = useTaskStore((s) => (s.selectedListId ? (s.lists.find((l) => l.id === s.selectedListId) ?? null) : null))
  const setSearchQuery = useTaskStore((s) => s.setSearchQuery)
  const isLargeScreen = useIsLargeScreen()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const isDesktop = useIsDesktop()
  const mainRef = useRef<HTMLDivElement>(null)
  const { sensors, dragOverlayTask, dragActiveRef, handleDragStart, handleDragEnd, handleDragCancel } = useAppDnd()

  useGlobalShortcuts({ searchRef, onShowHelp: () => setShowShortcuts(true) })
  useShortcutsHelpRequest(() => setShowShortcuts(true))
  useReminders()
  useFollowToday()

  const isTodoSurface = isTodoSurfaceView(selectedView)
  const hideGlobalHeader = !isTodoSurface && !searchQuery.trim()
  // 細い To‑Do パネルは lg 以上のみ。それ未満は置く幅がないのでサイドバー内に畳み込む
  const showTodoNavPanel = isLargeScreen && isTodoNavView(selectedView)

  // スマホの To-Do は、画面のどこからでも右へ払うとドロワー（リスト）が出る。
  // 画面の左端からは OS・ブラウザの「戻る」が先に取るので、端に頼らない
  useSwipeNav(
    mainRef,
    !isDesktop && isTodoSurface && !searchQuery.trim()
      ? (dir) => {
          if (dir === -1) setSidebarOpen(true)
        }
      : undefined,
    () => dragActiveRef.current,
    { follow: false },
  )

  const mainContent = (() => {
    if (searchQuery.trim()) return <SearchResults />
    switch (selectedView) {
      case 'planner':
        return <TodayPlannerView />
      case 'calendar':
        return <CalendarHubView />
      case 'stats':
        return <StatsView />
      case 'habits':
        return <HabitsView />
      case 'completed':
        return <CompletedTasksView />
      case 'archived':
        return <TaskBinView mode="archived" />
      case 'deleted':
        return <TaskBinView mode="deleted" />
      case 'settings':
        return <SettingsView />
      default:
        // いつか・チェックリストも To-Do と同じ一覧（違いは TaskItem・TaskList がリストの種類で出し分ける）
        return <TaskList onOpenNav={() => setSidebarOpen(true)} />
    }
  })()

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

        <div
          ref={mainRef}
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0"
        >
          {!hideGlobalHeader && <SearchBox inputRef={searchRef} />}

          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <ErrorBoundary
              scope="screen"
              resetKey={`${selectedView ?? ''}|${selectedList?.id ?? ''}|${searchQuery.trim()}`}
              onLeave={() => {
                setSearchQuery('')
                useTaskStore.getState().selectView('planner')
              }}
            >
              {/* 画面を切り替えたら、空白から急に変わらずふわっと出す（リストを替えただけでは作り直さない） */}
              <div key={searchQuery.trim() ? 'search' : (selectedView ?? 'list')} className="flex min-h-0 flex-1 flex-col animate-fade-in">
                <Suspense fallback={<div className="flex-1" />}>{mainContent}</Suspense>
              </div>
            </ErrorBoundary>
          </div>
        </div>

        {showShortcuts && (
          <OverlaySuspense>
            <ShortcutsHelp onClose={() => setShowShortcuts(false)} />
          </OverlaySuspense>
        )}
        <OverlayHost />
        <UndoToast />
        <TooltipHost />
        <MoveToast />
        <StorageFullBanner />
        <FloatingTimer />
        <RecordPromptHost />
        <MobileBottomNav onNavigate={() => setSidebarOpen(false)} />
      </div>

      {/* 離したら置いた場所へすっと収まる（急に別の場所に現れない） */}
      <DragOverlay dropAnimation={DROP_ANIMATION}>
        {dragOverlayTask ? (
          <DragOverlayTaskRow
            taskId={dragOverlayTask.taskId}
            isSubtask={dragOverlayTask.isSubtask}
            count={dragOverlayTask.count}
            lift={dragOverlayTask.lift}
          />
        ) : null}
      </DragOverlay>

      <DndTaskDragShell />
      <TimerDropZone />
    </DndContext>
  )
}
