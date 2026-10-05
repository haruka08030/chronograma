import { sortModeOf } from '../lib/todoSurfaceView'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { getFilteredRootTasks } from '../lib/mainListTasks'
import { unplannedListIds } from '../lib/listKind'
import { isActiveTask } from '../lib/taskLifecycle'

const UNSCHEDULED = '__unscheduled__'
import { TaskItem } from './TaskItem'
import { displayListName } from '../lib/displayListName'
import { useTaskListSelection } from '../hooks/useTaskListSelection'
import { useBulkTaskActions } from '../hooks/useBulkTaskActions'
import { EmptyState } from './ui/EmptyState'
import { CheckCircleIcon } from './icons'
import { sectionLabelClass } from './ui/sectionLabelClass'
import { fieldClass } from './ui/fieldClass'
import { openTaskDetail, openTaskMenu } from '../lib/overlays'
import { META_TEXT } from './ui/textClass'
import { isLogTask } from '../types/task'

export function CalendarTaskDock() {
  const { t } = useTranslation()
  // To‑Do の一覧と同じく、時間を決めた予定の ✓ は「完了＋記録」
  const tasks = useTaskStore((s) => s.tasks)
  const lists = useTaskStore((s) => s.lists)
  const sortByKey = useTaskStore((s) => s.sortByKey)
  const filterTag = useTaskStore((s) => s.filterTag)
  const sections = useTaskStore((s) => s.sections)

  // 既定は「時間が未定のタスク」（全リスト横断）。カレンダーに置く候補を探す場所なので 1 リストに絞らない
  const [dockListId, setDockListId] = useState<string>(UNSCHEDULED)
  const openDetail = openTaskDetail
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const deleteTasks = useTaskStore((s) => s.deleteTasks)
  const bulk = useBulkTaskActions()

  const sortedLists = useMemo(() => [...lists].sort((a, b) => a.order - b.order), [lists])

  const excludedListIds = useMemo(() => unplannedListIds(lists), [lists])
  const filtered = useMemo(
    () =>
      dockListId === UNSCHEDULED
        ? tasks
            .filter(
              (t) =>
                !t.parentId &&
                isActiveTask(t) &&
                !excludedListIds.has(t.listId) &&
                !(t.startTime && t.endTime),
            )
            .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.order - b.order)
        : getFilteredRootTasks({
        tasks,
        selectedView: null,
        selectedListId: dockListId,
        // そのリストを To‑Do で開いたときと同じ並び順
        sortMode: sortModeOf(sortByKey, dockListId),
        filterTag,
        sections,
      }),
    [tasks, dockListId, sortByKey, filterTag, sections, excludedListIds],
  )

  const active = useMemo(() => filtered.filter((t) => !t.completed && !isLogTask(t)), [filtered])
  const activeIds = useMemo(() => active.map((t) => t.id), [active])

  // 選択とキー操作は To-Do 一覧と同じ（Shift の範囲・⌘A・↑↓・Delete・⌘Enter・⌘/・Enter・Space・Esc）
  // メニューの「実行したら選択を解除」は、選択のフックを作ったあとに入れる
  const clearSelectedRef = useRef<() => void>(() => {})
  const { selected, clearSelection: clearSelected, makeRowClick, makeSelection, soloIds } = useTaskListSelection({
    rowIds: activeIds,
    openDetail,
    toggleRow: toggleTask,
    removeRows: deleteTasks,
    completeRows: bulk.complete,
    openMenu: (m) => openTaskMenu({ kind: 'task', ...m, onDone: () => clearSelectedRef.current() }),
    resetOn: [dockListId],
  })
  useEffect(() => {
    clearSelectedRef.current = clearSelected
  }, [clearSelected])

  const selectedInOrder = useMemo(
    () => active.map((t) => t.id).filter((id) => selected.has(id)),
    [active, selected],
  )
  const getDragGroupIds = useCallback(
    (id: string): string[] =>
      selected.has(id) && selectedInOrder.length >= 2 ? selectedInOrder : soloIds(id),
    [selected, selectedInOrder, soloIds],
  )

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-row">
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-zinc-50/80 dark:bg-zinc-900/80">
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
          <label htmlFor="calendar-dock-list" className={sectionLabelClass('field', 'shrink-0')}>
            {t('calendarDock.listHeading')}
          </label>
          <select
            id="calendar-dock-list"
            value={dockListId}
            onChange={(e) => setDockListId(e.target.value)}
            className={fieldClass({ size: 'sm' }, 'min-w-0 flex-1')}
          >
            <option value={UNSCHEDULED}>{t('calendarDock.unscheduled')}</option>
            {sortedLists.filter((l) => !excludedListIds.has(l.id)).map((l) => (
              <option key={l.id} value={l.id}>
                {displayListName(l.id, l.name)}
              </option>
            ))}
          </select>
        </div>
        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
          {active.length === 0 && (
            <EmptyState size="sm" icon={<CheckCircleIcon strokeWidth={1} />} title={t('calendarDock.empty')} />
          )}
          {selected.size > 0 && (
            <div className={`flex items-center justify-between px-2 py-1 ${META_TEXT}`}>
              <span>{t('taskList.selectedCount', { count: selected.size })}</span>
              <button
                type="button"
                onClick={clearSelected}
                className="rounded px-1.5 py-0.5 hover:bg-zinc-200/60 dark:hover:bg-zinc-700/60"
              >
                {t('taskList.clearSelection')}
              </button>
            </div>
          )}
          {active.map((t) => (
            <TaskItem
              key={t.id}
              task={t}
              hideDueDatePicker
              onRowClick={makeRowClick(t.id)}
              selection={makeSelection(t.id)}
              dragGroupIds={getDragGroupIds(t.id)}
              onNativeDragEnd={clearSelected}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
