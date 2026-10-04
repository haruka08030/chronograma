import { useSupabaseSync } from './hooks/useSupabaseSync'
import { useAutoBackup } from './hooks/useAutoBackup'
import { useNotionSync } from './hooks/useNotionSync'
import { useCanvasSync } from './hooks/useCanvasSync'
import { lazy, Suspense, useEffect, useState, useRef, useCallback, useMemo, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import i18n from './i18n/config'
import { useTaskStore } from './store/taskStore'
import { Sidebar } from './components/Sidebar'
import { TodoNavPanel } from './components/TodoNavPanel'
import { LABEL_DROP_PREFIX, LIST_PREFIX } from './lib/listDnD'
import { labelDroppedTasks, moveDroppedTasks } from './lib/navDrop'
import { TASK_PREFIX, type TaskRootDragData } from './components/SortableTaskItem'
import { TodayPlannerView } from './components/TodayPlannerView'
import { OPEN_TIMER_ACTION } from './components/RecordPanel'
import { requestAction, whenElement } from './lib/pendingAction'
import { FloatingTimer } from './components/FloatingTimer.tsx'
import { UndoToast } from './components/UndoToast.tsx'
import { MoveToast } from './components/MoveToast'
import { StorageFullBanner } from './components/StorageFullBanner'
import { DndTaskDragShell, MOBILE_DROP_PREFIX } from './components/DndTaskDragShell'
import { TaskItem } from './components/TaskItem'
import { TimerDropZone } from './components/TimerDropZone'
import { TIMER_DROP_ID, canStartTimerFor, setTimerDragActive, startTimerForTask } from './lib/timerDrop'
import { checkLocalReminders } from './lib/localReminders'
import { isWebPushActive, syncWebPush } from './lib/webPush'
import { useAuth } from './contexts/AuthContext'
import { unplannedListIds } from './lib/listKind'
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
import { shortcutLabel } from './lib/keyboard'
import { TooltipHost } from './components/ui/Tooltip'
import { OverlayHost } from './components/OverlayHost'
import { SHORTCUTS, dispatchNav, dispatchSelectAll } from './lib/shortcuts'
import { useHotkey } from './hooks/useHotkey'
import { isTodoNavView, isTodoSurfaceView, sortKeyOf, sortModeOf } from './lib/todoSurfaceView'
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

// 最初に開く「今日の計画」以外の画面は、開いたときに読み込む（最初の読み込みを軽くする）
const CalendarHubView = lazy(() => import('./components/CalendarHubView').then((m) => ({ default: m.CalendarHubView })))
const StatsView = lazy(() => import('./components/StatsView').then((m) => ({ default: m.StatsView })))
const HabitsView = lazy(() => import('./components/HabitsView').then((m) => ({ default: m.HabitsView })))
const TaskBinView = lazy(() => import('./components/TaskBinView').then((m) => ({ default: m.TaskBinView })))
const CompletedTasksView = lazy(() => import('./components/CompletedTasksView').then((m) => ({ default: m.CompletedTasksView })))
const SettingsView = lazy(() => import('./components/SettingsView').then((m) => ({ default: m.SettingsView })))
const TaskList = lazy(() => import('./components/TaskList').then((m) => ({ default: m.TaskList })))
const SearchResults = lazy(() => import('./components/SearchResults').then((m) => ({ default: m.SearchResults })))
const ShortcutsHelp = lazy(() => import('./components/ShortcutsHelp').then((m) => ({ default: m.ShortcutsHelp })))
import type { Task } from './types/task'
import { MobileBottomNav } from './components/MobileBottomNav'
import { RecordPromptHost } from './components/RecordPromptHost'
import { CloseIcon } from './components/icons'
import { undoGoogleDelete } from './lib/googleEventEdit'
import { searchTasks } from './lib/searchTasks'
import { openTaskDetail } from './lib/overlays'

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
  if (id.startsWith('drop::') || id.startsWith(LIST_PREFIX) || id.startsWith('mobile-drop::') || id.startsWith(LABEL_DROP_PREFIX)) return 3
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

/** 離したときの動き。速さと動き方は他の出入りと同じ（index.css の --ease-standard） */
const DROP_ANIMATION = { duration: 150, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }

function DragOverlayTaskRow({ task, isSubtask, count }: { task: Task; isSubtask: boolean; count: number }) {
  const { t } = useTranslation()
  const isMulti = count > 1
  return (
    // 少しだけ大きくして、持ち上げている感じを出す
    <div className="relative w-[min(640px,calc(100vw-2rem))] scale-[1.02]">
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
  // 同期より先に呼ぶ（その日の控えを、サーバーの内容が反映される前に取る）
  useAutoBackup()
  useSupabaseSync()
  useNotionSync()
  useCanvasSync()

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
    // ドラッグはどれも専用のつまみ（`touch-none` の ⋮⋮ ボタン）からしか始まらないので、
    // タップとの判別に長い待ちは要らない。長押しの一括選択は行側（450ms）で別に拾う
    useSensor(TouchSensor, { activationConstraint: { delay: 140, tolerance: 8 } }),
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const activeId = String(event.active.id)
    const group = (event.active.data.current as TaskRootDragData | undefined)?.dragGroupRootIds
    const count = group && group.length > 1 ? group.length : 1
    const draggedId = activeId.startsWith(TASK_PREFIX)
      ? activeId.slice(TASK_PREFIX.length)
      : activeId.startsWith(SUBTASK_PREFIX) ? parseSubtaskDragId(activeId) : null
    if (draggedId && canStartTimerFor(useTaskStore.getState().tasks.find((t) => t.id === draggedId))) {
      setTimerDragActive(true)
    }
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
    setTimerDragActive(false)
  }, [])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setDragOverlayTask(null)
    setTimerDragActive(false)
    const { active, over } = event
    const activeId = String(active.id)

    // 上の「ここに落として計測開始」。横に動いてもインデント扱いにしないよう先に見る
    if (over?.id === TIMER_DROP_ID) {
      const taskId = activeId.startsWith(SUBTASK_PREFIX)
        ? parseSubtaskDragId(activeId)
        : activeId.startsWith(TASK_PREFIX) ? activeId.slice(TASK_PREFIX.length) : null
      if (taskId) startTimerForTask(taskId)
      return
    }

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
        sortMode: sortModeOf(state.sortByKey, sortKeyOf(state.selectedListId, state.selectedView)),
        filterTag: state.filterTag,
        filterColor: state.filterColor,
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
    } else if (activeId.startsWith(TASK_PREFIX) && overId.startsWith(LABEL_DROP_PREFIX)) {
      const taskId = activeId.slice(TASK_PREFIX.length)
      const group =
        (active.data.current as TaskRootDragData | undefined)?.dragGroupRootIds ?? [taskId]
      labelDroppedTasks(group, overId.slice(LABEL_DROP_PREFIX.length))
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
        moveDroppedTasks(group, listId)
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

  // 1 文字ショートカット（Google カレンダー風）。入力中・修飾キー付き・ダイアログやカードが開いている間は効かない
  const focusQuickAddEl = (el: HTMLElement) => {
    if (el instanceof HTMLInputElement) el.focus()
    else el.click()
  }
  const findQuickAdd = () => document.querySelector<HTMLElement>('[data-quickadd]')
  useHotkey(SHORTCUTS.today.hotkeys, () => dispatchNav('today'))
  useHotkey(SHORTCUTS.next.hotkeys, () => dispatchNav('next'))
  useHotkey(SHORTCUTS.prev.hotkeys, () => dispatchNav('prev'))
  useHotkey(SHORTCUTS.dayView.hotkeys, () => useTaskStore.getState().selectView('planner'))
  useHotkey([...SHORTCUTS.weekView.hotkeys, ...SHORTCUTS.monthView.hotkeys], (e) => {
    const store = useTaskStore.getState()
    store.setCalendarMode(e.key === 'w' ? 'week' : 'month')
    store.selectView('calendar')
  })
  useHotkey(SHORTCUTS.logView.hotkeys, () => {
    // 記録は「今日」に統合。今日を開いて「記録する」を開く
    useTaskStore.getState().selectView('planner')
    requestAction(OPEN_TIMER_ACTION)
  })
  // 画面を切り替えたら、その画面の欄が出てからフォーカスする（読み込みに時間がかかっても取りこぼさない）
  useHotkey(SHORTCUTS.create.hotkeys, () => {
    if (!findQuickAdd()) useTaskStore.getState().selectView('planner')
    whenElement(findQuickAdd, focusQuickAddEl)
  })
  useHotkey(SHORTCUTS.search.hotkeys, () => {
    if (!searchRef.current) useTaskStore.getState().selectView('all')
    whenElement(() => searchRef.current, (el) => el.focus())
  })
  useHotkey(SHORTCUTS.help.hotkeys, () => setShowShortcuts(true))

  // 検索欄: Esc 1 回で文字を消し、2 回目で欄から出る。↓ で結果の一覧へ（最初の行に枠）、Enter で最初の結果を開く
  const onSearchKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      if (searchQuery) setSearchQuery('')
      else e.currentTarget.blur()
    } else if (e.key === 'ArrowDown' && searchQuery.trim()) {
      e.preventDefault()
      e.currentTarget.blur()
      // 一覧のキー操作（useTaskListSelection）に ↓ を渡し、最初の行に枠を出す
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    } else if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      const first = searchTasks(useTaskStore.getState().tasks, searchQuery)[0]
      if (!first) return
      e.preventDefault()
      // 欄から出しておく（残すと、詳細を閉じる Esc が欄の「文字を消す」になる）
      e.currentTarget.blur()
      openTaskDetail(first.id)
    }
  }

  // ⌘K 検索・⌘N 追加は入力中でも、カードやタスク詳細が開いていても効く
  useHotkey(SHORTCUTS.searchAnywhere.hotkeys, () => {
    // `/` と同じ: 検索欄の無い画面（今日・カレンダーなど）では To-Do へ切り替えてから入る
    if (!searchRef.current) useTaskStore.getState().selectView('all')
    whenElement(() => searchRef.current, (el) => el.focus())
  }, { scope: 'always', allowInInputs: true })
  useHotkey(SHORTCUTS.createAnywhere.hotkeys, () => {
    const quickAdd = document.querySelector<HTMLElement>('[data-quickadd]')
    if (quickAdd instanceof HTMLInputElement) {
      quickAdd.focus()
    } else if (quickAdd) {
      quickAdd.click()
    } else {
      useTaskStore.getState().requestQuickAdd()
    }
  }, { scope: 'always', allowInInputs: true })
  useHotkey(SHORTCUTS.selectAll.hotkeys, () => {
    // To-Do 一覧ならタスクを全選択。それ以外は、メモなど選べる文字の中にいるときだけその中を全選択し、
    // 画面全体（ボタンや見出しまで）が青くなるブラウザ標準の全選択はしない
    if (dispatchSelectAll()) return
    const anchor = window.getSelection()?.anchorNode
    const box = (anchor instanceof Element ? anchor : anchor?.parentElement)?.closest('.select-text')
    if (box) window.getSelection()?.selectAllChildren(box)
  }, { scope: 'always' })
  // 入力中はブラウザのテキスト取り消しを優先する（allowInInputs なし）。戻すものが無ければブラウザに任せる
  useHotkey(SHORTCUTS.undo.hotkeys, () => {
    const state = useTaskStore.getState()
    // 消したばかりの Google の予定は、トーストと同じくそれを先に戻す
    if (state.googleUndo && undoGoogleDelete()) return
    if (state.undoLastOperation()) return
    if (state.recentDeletes.length === 0) return false
    state.undoDelete()
  }, { scope: 'always' })
  useHotkey(SHORTCUTS.redo.hotkeys, () => useTaskStore.getState().redoLastOperation(), { scope: 'always' })
  // 記録を止める（l → Enter で間違えて始めたときも、マウスに持ち替えずに止められる。1 分未満は記録に残らない）
  useHotkey(SHORTCUTS.stopLog.hotkeys, () => {
    const state = useTaskStore.getState()
    if (!state.activeTimer) return false
    state.stopTimer()
  })

  // 通知（朝のまとめ・予定の前・締切の前・予定のあとの記録の確認・タイマーの止め忘れ）。
  // ログイン中は Web Push（閉じていても届く）に購読し、使えない環境ではタブを開いている間だけ出す
  const notificationsEnabled = useTaskStore((s) => s.notificationsEnabled)
  const dailyReminders = useTaskStore((s) => s.dailyReminders)
  const eventReminderMinutes = useTaskStore((s) => s.eventReminderMinutes)
  const recordPrompts = useTaskStore((s) => s.recordPrompts)
  const activeTimer = useTaskStore((s) => s.activeTimer)
  const hasTaskReminders = useTaskStore((s) => s.tasks.some((t) => (t.reminders?.length ?? 0) > 0 && !t.completed))
  const appTimeZoneSetting = useTaskStore((s) => s.appTimeZone)
  const { user } = useAuth()
  const userId = user?.id ?? null
  useEffect(() => {
    void syncWebPush({
      userId,
      reminders: dailyReminders,
      eventReminderMinutes,
      dueReminders: notificationsEnabled,
      recordPrompts,
      hasTaskReminders,
      activeTimer,
      lang: i18n.resolvedLanguage ?? 'ja',
    })
  }, [userId, dailyReminders, eventReminderMinutes, notificationsEnabled, recordPrompts, hasTaskReminders, activeTimer, appTimeZoneSetting])
  useEffect(() => {
    const tick = () => {
      if (isWebPushActive()) return
      const state = useTaskStore.getState()
      checkLocalReminders({
        tasks: state.tasks,
        excludedListIds: unplannedListIds(state.lists),
        daily: state.dailyReminders,
        settings: {
          eventReminderMinutes: state.eventReminderMinutes,
          dueReminders: state.notificationsEnabled,
          recordPrompts: state.recordPrompts,
        },
        activeTimer: state.activeTimer,
        onOpen: () => useTaskStore.getState().selectView('planner'),
        onRecord: (taskId) => useTaskStore.getState().openRecordPrompt(taskId),
      })
    }
    tick()
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [])

  const isTodoSurface = isTodoSurfaceView(selectedView)
  const hideGlobalHeader = !isTodoSurface && !searchQuery.trim()
  // 細い To‑Do パネルは lg 以上のみ。それ未満は置く幅がないのでサイドバー内に畳み込む
  const showTodoNavPanel = isLargeScreen && isTodoNavView(selectedView)

  const mainContent = (() => {
    if (searchQuery.trim()) return <SearchResults />
    switch (selectedView) {
      case 'planner': return <TodayPlannerView />
      case 'calendar': return <CalendarHubView />
      case 'stats': return <StatsView />
      case 'habits': return <HabitsView />
      case 'completed': return <CompletedTasksView />
      case 'archived': return <TaskBinView mode="archived" />
      case 'deleted': return <TaskBinView mode="deleted" />
      case 'settings': return <SettingsView />
      default:
        // いつか・チェックリストも To-Do と同じ一覧（違いは TaskItem・TaskList がリストの種類で出し分ける）
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

              <div className="relative min-w-0 flex-1 max-w-2xl">
                <svg
                  className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-500"
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
                  onKeyDown={onSearchKeyDown}
                  placeholder={isLargeScreen ? t('app.searchPlaceholder', { key: shortcutLabel(['mod', 'K']) }) : t('app.searchPlaceholderTouch')}
                  className={`w-full rounded-full border border-zinc-200/55 bg-zinc-50/60 py-2.5 pl-10 text-sm text-zinc-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] outline-none backdrop-blur-sm transition-[background-color,border-color,box-shadow,color] duration-200 placeholder:text-zinc-400 focus:border-zinc-300/70 focus:bg-white/85 focus:shadow-[0_2px_8px_rgba(15,23,42,0.06)] focus:ring-2 focus:ring-accent-500/30 dark:border-zinc-700/35 dark:bg-zinc-950/35 dark:text-zinc-100 dark:shadow-none dark:placeholder:text-zinc-500 dark:focus:border-zinc-600/50 dark:focus:bg-zinc-900/45 dark:focus:ring-white/[0.06] ${searchQuery ? 'pr-10' : 'pr-4'}`}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label={t('app.clearSearch')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-zinc-400/70 transition-colors hover:bg-zinc-200/50 hover:text-zinc-600 dark:text-zinc-500/60 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-300"
                  >
                    <CloseIcon className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </header>
          )}

          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <ErrorBoundary
              scope="screen"
              resetKey={`${selectedView ?? ''}|${selectedList?.id ?? ''}|${searchQuery.trim()}`}
              onLeave={() => {
                setSearchQuery('')
                useTaskStore.getState().selectView('planner')
              }}
            >
              <Suspense fallback={<div className="flex-1" />}>{mainContent}</Suspense>
            </ErrorBoundary>
          </div>
        </div>

        {showShortcuts && (
          <Suspense fallback={null}>
            <ShortcutsHelp onClose={() => setShowShortcuts(false)} />
          </Suspense>
        )}
        <OverlayHost />
        <UndoToast />
        <TooltipHost />
        <MoveToast />
        <StorageFullBanner />
        <FloatingTimer />
        <RecordPromptHost />
        <MobileBottomNav
          onOpenMore={() => setSidebarOpen(true)}
          onNavigate={() => setSidebarOpen(false)}
        />
      </div>

      {/* 離したら置いた場所へすっと収まる（急に別の場所に現れない） */}
      <DragOverlay dropAnimation={DROP_ANIMATION}>
        {dragOverlayTaskEntity && dragOverlayTask ? (
          <DragOverlayTaskRow
            task={dragOverlayTaskEntity}
            isSubtask={dragOverlayTask.isSubtask}
            count={dragOverlayTask.count}
          />
        ) : null}
      </DragOverlay>

      <DndTaskDragShell />
      <TimerDropZone />
    </DndContext>
  )
}
