import { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { isTodoSurfaceView, sortKeyOf, sortModeOf } from '../lib/todoSurfaceView'
import { isActiveTask } from '../lib/taskLifecycle'
import { displayListName } from '../lib/displayListName'
import { colorLabelText } from '../lib/todoColorLabels'
import { TASK_PREFIX } from './SortableTaskItem'
import { subtaskDragId } from '../lib/subtaskDnD'
import { useSectionScrollTarget } from '../hooks/useSectionScrollTarget'
import { QuickAdd } from './QuickAdd'
import { isLogTask, type Task } from '../types/task'
import { useBulkTaskActions } from '../hooks/useBulkTaskActions'
import { useTodayToggle } from '../hooks/useTodayToggle'
import { useOpenTaskRow } from '../hooks/useOpenTaskRow'
import { CheckCircleIcon, CheckIcon } from './icons'
import { SelectionBar } from './ui/SelectionBar'
import { EmptyState } from './ui/EmptyState'
import { useTaskListSelection } from '../hooks/useTaskListSelection'
import { openTaskMenu } from '../lib/overlays'
import { useTaskListDnd } from '../hooks/useTaskListDnd'
import { useLiftedRowId } from '../hooks/useTouchLift'
import { setLiftGroupCount } from '../lib/touchLift'
import { useTaskListRows } from '../hooks/useTaskListRows'
import { useSectionEditing } from '../hooks/useSectionEditing'
import { TaskListHeader } from './todo/TaskListHeader'
import { TaskListActiveContent } from './todo/TaskListActiveContent'
import { CompletedTasksSection } from './todo/CompletedTasksSection'
import { PAGE_SCROLL_CLASS } from './ui/layoutClass'
import { FilterNoMatch } from './ui/FilterChips'
import { hasTaskFilter, NO_TODO_FILTER, todoFilterFor } from '../lib/taskFilter'

function countIncompleteDescendants(parentId: string, childrenByParent: Map<string, Task[]>): number {
  let n = 0
  for (const st of childrenByParent.get(parentId) ?? []) {
    if (!st.completed && !isLogTask(st)) {
      n += 1 + countIncompleteDescendants(st.id, childrenByParent)
    }
  }
  return n
}

export function TaskList({
  onOpenNav,
}: {
  /** スマホで題名の左の ≡ を押したとき（リストのドロワーを出す） */
  onOpenNav?: () => void
} = {}) {
  const { t } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const selectedListId = useTaskStore((s) => s.selectedListId)
  const selectedView = useTaskStore((s) => s.selectedView)
  const lists = useTaskStore((s) => s.lists)
  /** 開いているリストの種類。いつか・チェックリストも操作は To-Do と同じで、印・日付・下の「済み」の出し方だけ変える */
  const listKind = useTaskStore((s) => s.lists.find((l) => l.id === s.selectedListId)?.kind ?? 'tasks')
  // 並び順はリスト・ビュー・色ラベルごと
  const sortMode = useTaskStore((s) => sortModeOf(s.sortByKey, sortKeyOf(s.selectedListId, s.selectedView, s.filterColor)))
  const sectionGrouping = useTaskStore((s) => s.sectionGrouping)
  const filterTag = useTaskStore((s) => s.filterTag)
  const filterColor = useTaskStore((s) => s.filterColor)
  const todoFilter = useTaskStore((s) => s.todoFilter)
  const setTodoFilter = useTaskStore((s) => s.setTodoFilter)
  // じょうごの絞り込み（優先度・見積もり）は To-Do のリスト・ビューだけ
  const taskFilter = useMemo(() => todoFilterFor(lists, selectedListId, todoFilter), [lists, selectedListId, todoFilter])
  const filtering = taskFilter !== undefined && hasTaskFilter(taskFilter)
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const addTaskAfter = useTaskStore((s) => s.addTaskAfter)
  const deleteTasks = useTaskStore((s) => s.deleteTasks)
  const sections = useTaskStore((s) => s.sections)
  // 行を押したとき: PC は詳細、スマホは短いシート（今日の計画と同じ）
  const openDetail = useOpenTaskRow()
  const [pendingAutoEditTaskId, setPendingAutoEditTaskId] = useState<string | null>(null)
  /** 選択の解除（下の useTaskListSelection が入れる。ドラッグの処理はそれより前に作るので参照で受ける） */
  const clearSelectionRef = useRef<() => void>(() => {})
  const { previewParentId, taskDragging } = useTaskListDnd(clearSelectionRef)
  const { sectionTitle, sectionActions, beginDraftSection, draftSection, sectionMenuElement } = useSectionEditing(
    selectedListId,
    selectedView,
  )

  const currentList = selectedListId ? lists.find((l) => l.id === selectedListId) : null
  const presets = useTaskStore((s) => s.timeLogTagPresets)
  const categoryColors = useTaskStore((s) => s.logCategoryColors)
  // ナビから色ラベルを開いたとき（「すべて」を色で絞る）はラベル名を見出しにする
  const colorView = selectedView === 'all' && filterColor !== null
  const title = colorView
    ? colorLabelText(filterColor, presets, categoryColors, t)
    : selectedView
      ? t(`sidebar.views.${selectedView}`)
      : currentList
        ? displayListName(currentList.id, currentList.name)
        : t('taskList.defaultTitle')

  const selectedList = selectedListId ? (lists.find((l) => l.id === selectedListId) ?? null) : null

  const { filtered, groupingScope, groupBySection, hasSections, showSectionBlocks, active, sectionBlocks } = useTaskListRows({
    tasks,
    lists,
    sections,
    selectedListId,
    selectedView,
    sortMode,
    sectionGrouping,
    filterTag,
    filterColor,
    taskFilter,
  })

  /** 塊で分けないとき、行に出すセクション名 */
  const sectionNameById = useMemo(() => new Map(sections.map((s) => [s.id, s.name])), [sections])
  const sectionLabelFor = (task: { sectionId: string | null }) =>
    !groupBySection && task.sectionId ? (sectionNameById.get(task.sectionId) ?? null) : null

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
      if (!p.completed && !isLogTask(p)) n++
      n += countIncompleteDescendants(p.id, childrenByParent)
    }
    return n
  }, [filtered, childrenByParent])

  // 完了した To-Do はナビの「完了済み」に集める。チェックリスト（使い回す）といつか（かなえた）だけリストの下に残す
  const keepsDoneInList = listKind === 'checklist' || listKind === 'someday'
  const completedTodos = useMemo(
    () => (keepsDoneInList ? filtered.filter((t) => t.completed && !isLogTask(t)) : []),
    [keepsDoneInList, filtered],
  )
  const showQuickAdd = isTodoSurfaceView(selectedView)
  const canDrag = sortMode === 'manual'

  const [showCompleted, setShowCompleted] = useState(false)

  const handleEnterCreateSibling = useCallback(
    (task: Task) => {
      const newTaskId = addTaskAfter(task.id, '')
      if (!newTaskId) return
      setPendingAutoEditTaskId(newTaskId)
      queueMicrotask(() => {
        setPendingAutoEditTaskId((prev) => (prev === newTaskId ? null : prev))
      })
    },
    [addTaskAfter],
  )

  const flatActiveIds = useMemo(() => {
    const out: string[] = []
    const walk = (parentId: string) => {
      for (const st of childrenByParent.get(parentId) ?? []) {
        if ((listKind === 'checklist' || !st.completed) && !isLogTask(st)) {
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
  }, [active, childrenByParent, listKind])

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

  const flatCombined = useMemo(() => [...flatActiveIds, ...flatCompletedTodoIds], [flatActiveIds, flatCompletedTodoIds])

  const bulk = useBulkTaskActions()
  const todayToggle = useTodayToggle()

  // 選択とキー操作（カレンダーの置き場と同じ）
  const openMenu = useCallback(
    (menu: { x: number; y: number; taskIds: string[] }) =>
      openTaskMenu({ kind: 'task', ...menu, onDone: () => clearSelectionRef.current() }),
    [],
  )
  const { selected, clearSelection, makeRowClick, makeSelection, soloIds, listboxProps } = useTaskListSelection({
    rowIds: flatActiveIds,
    rangeIds: flatCombined,
    openDetail,
    toggleRow: toggleTask,
    removeRows: deleteTasks,
    completeRows: bulk.toggleComplete,
    openMenu,
    // いつか・チェックリストは日に置かないので、Shift+T（今日やる ⇄ 明日へ）はタスクのリストだけ
    todayToggleRows: listKind === 'tasks' ? (ids) => todayToggle(ids).run() : undefined,
    resetOn: [selectedListId, selectedView, filterTag, filterColor, sortMode],
  })
  // 選んだものが全部済みなら「完了」は何もしないので出さない（戻すのは「操作」のメニューから）
  const selectionAllDone = useTaskStore(
    (s) => selected.size > 0 && [...selected].every((id) => s.tasks.find((x) => x.id === id)?.completed),
  )
  useEffect(() => {
    clearSelectionRef.current = clearSelection
  }, [clearSelection])

  const getDragGroupRootIds = useCallback(
    (taskId: string): string[] => {
      if (selected.has(taskId)) {
        const rootsSelectedInOrder = active.map((t) => t.id).filter((id) => selected.has(id))
        if (rootsSelectedInOrder.length >= 2) return rootsSelectedInOrder
      }
      return soloIds(taskId)
    },
    [active, selected, soloIds],
  )

  // タッチの長押しで浮かせている間、束の件数をドラッグの見た目（バッジ）へ渡す。押さえたまま別の指で足すと増える
  const liftedRowId = useLiftedRowId()
  useEffect(() => {
    if (liftedRowId) setLiftGroupCount(getDragGroupRootIds(liftedRowId).length)
  }, [liftedRowId, getDragGroupRootIds])

  /** 縦線付き。サブの完了サークルが親タスク名の先頭付近に来るよう ml+pl を調整（親と同じ行内順: ハンドル→選択→丸） */
  const subtaskNestRow = 'border-l border-zinc-200 dark:border-zinc-700 ml-[13px] pl-3'
  const subtaskNestNoDrag = subtaskNestRow
  const subtaskNestWithDrag = subtaskNestRow

  // チェックリストはチェックした子も親の下に残す（「カレー」の材料がそろうまでまとめて見える）
  const keepDoneChildren = listKind === 'checklist'
  const incompleteSubtasks = useCallback(
    (parentId: string) => (childrenByParent.get(parentId) ?? []).filter((st) => (keepDoneChildren || !st.completed) && !isLogTask(st)),
    [childrenByParent, keepDoneChildren],
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

  useSectionScrollTarget(sectionBlocks)

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-row">
      <div className={`flex flex-col ${PAGE_SCROLL_CLASS}`}>
        <TaskListHeader
          title={title}
          colorView={colorView}
          filterColor={filterColor ?? undefined}
          incompleteCount={incompleteCount}
          selectedList={selectedList}
          selectedListId={selectedListId}
          listKind={listKind}
          sortMode={sortMode}
          groupingScope={groupingScope}
          groupBySection={groupBySection}
          hasSections={hasSections}
          onAddSection={beginDraftSection}
          onOpenNav={onOpenNav}
        />

        <div className="flex-1 px-4 pb-4 space-y-0.5">
          {showQuickAdd && (
            <div className="mb-1.5">
              <QuickAdd
                placeholder={
                  listKind === 'someday'
                    ? t('someday.addPlaceholder')
                    : listKind === 'checklist'
                      ? t('checklist.addPlaceholder')
                      : undefined
                }
              />
            </div>
          )}

          {incompleteCount === 0 && filtering && (
            <FilterNoMatch text={t('taskList.noMatch')} onClear={() => setTodoFilter(NO_TODO_FILTER)} className="px-3 py-2" />
          )}

          {incompleteCount === 0 && !showQuickAdd && !filtering && (
            <EmptyState
              icon={<CheckCircleIcon strokeWidth={1} />}
              title={t('taskList.allDoneTitle')}
              hint={t('taskList.allDoneSubtitle')}
            />
          )}

          {/* 読み上げ: 未完了の行は listbox（↑↓ の枠を aria-activedescendant で伝える） */}
          <div {...listboxProps} aria-label={title} className="space-y-0.5 outline-none">
            <TaskListActiveContent
              canDrag={canDrag}
              flatManualSortableIds={flatManualSortableIds}
              showSectionBlocks={showSectionBlocks}
              sectionBlocks={sectionBlocks}
              active={active}
              selectedListId={selectedListId}
              taskDragging={taskDragging}
              previewParentId={previewParentId}
              pendingAutoEditTaskId={pendingAutoEditTaskId}
              sectionTitle={sectionTitle}
              sectionActions={sectionActions}
              sectionLabelFor={sectionLabelFor}
              getDragGroupRootIds={getDragGroupRootIds}
              makeRowClick={makeRowClick}
              makeSelection={makeSelection}
              handleEnterCreateSibling={handleEnterCreateSibling}
              incompleteSubtasks={incompleteSubtasks}
              subtaskNestWithDrag={subtaskNestWithDrag}
              subtaskNestNoDrag={subtaskNestNoDrag}
            />
          </div>

          {draftSection}

          {completedTodos.length > 0 && (
            <CompletedTasksSection
              completedTodos={completedTodos}
              flatCompletedTodoIds={flatCompletedTodoIds}
              listKind={listKind}
              showCompleted={showCompleted}
              onToggleCompleted={() => setShowCompleted((v) => !v)}
              childrenByParent={childrenByParent}
              makeRowClick={makeRowClick}
              makeSelection={makeSelection}
              handleEnterCreateSibling={handleEnterCreateSibling}
              pendingAutoEditTaskId={pendingAutoEditTaskId}
              subtaskNestNoDrag={subtaskNestNoDrag}
            />
          )}
        </div>
      </div>
      {sectionMenuElement}
      {/* 選んでいる間: 件数・完了・「操作」を下に出す（今日の計画と同じバー） */}
      <SelectionBar
        selectedIds={selected}
        actions={
          selectionAllDone
            ? []
            : [
                {
                  label: t(
                    listKind === 'someday'
                      ? 'someday.fulfill'
                      : listKind === 'checklist'
                        ? 'checklist.check'
                        : 'taskList.selectionComplete',
                  ),
                  icon: <CheckIcon className="h-3.5 w-3.5" strokeWidth={2.5} />,
                  onClick: () => bulk.complete([...selected]),
                },
              ]
        }
        onClear={clearSelection}
      />
    </div>
  )
}
