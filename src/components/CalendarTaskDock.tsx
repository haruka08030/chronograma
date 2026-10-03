import { sortModeOf } from '../lib/todoSurfaceView'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { getFilteredRootTasks } from '../lib/mainListTasks'
import { unplannedListIds } from '../lib/listKind'
import { isActiveTask } from '../lib/taskLifecycle'

const UNSCHEDULED = '__unscheduled__'
import { isListedTimeLog } from '../lib/timeLogTask'
import { isModKey } from '../lib/keyboard'
import { TaskItem } from './TaskItem'
import { TaskDetail } from './TaskDetail'
import { useTaskDetailModal } from '../hooks/useTaskDetailModal'
import { displayListName } from '../lib/displayListName'
import { useCompleteWithLog } from '../hooks/useCompleteWithLog'
import { useSelectAllShortcut } from '../lib/shortcuts'
import { TaskContextMenu } from './TaskContextMenu'

export function CalendarTaskDock() {
  const { t } = useTranslation()
  // To‑Do の一覧と同じく、時間を決めた予定の ✓ は「完了＋記録」
  const { open: openCompleteWithLog, modal: completeWithLogModal } = useCompleteWithLog()
  const tasks = useTaskStore((s) => s.tasks)
  const lists = useTaskStore((s) => s.lists)
  const sortByKey = useTaskStore((s) => s.sortByKey)
  const filterTag = useTaskStore((s) => s.filterTag)
  const sections = useTaskStore((s) => s.sections)

  // 既定は「時間が未定のタスク」（全リスト横断）。カレンダーに置く候補を探す場所なので 1 リストに絞らない
  const [dockListId, setDockListId] = useState<string>(UNSCHEDULED)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const { detailTask, openDetail, closeDetail } = useTaskDetailModal(tasks)

  const toggleSelected = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const clearSelected = useCallback(() => setSelected(new Set()), [])
  const [menu, setMenu] = useState<{ x: number; y: number; taskIds: string[] } | null>(null)

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

  const active = filtered.filter((t) => !t.completed && !isListedTimeLog(t))

  // ⌘A: 置き場のタスクをすべて選ぶ（To-Do 一覧と同じ）
  useSelectAllShortcut(() => {
    if (active.length === 0) return false
    setSelected(new Set(active.map((x) => x.id)))
    return true
  })

  const selectedInOrder = useMemo(
    () => active.map((t) => t.id).filter((id) => selected.has(id)),
    [active, selected],
  )
  const getDragGroupIds = useCallback(
    (id: string): string[] =>
      selected.has(id) && selectedInOrder.length >= 2 ? selectedInOrder : [id],
    [selected, selectedInOrder],
  )
  const makeRowClick = useCallback(
    (id: string) => (e: React.MouseEvent) => {
      if (e.shiftKey || isModKey(e) || selected.size > 0) {
        toggleSelected(id)
        return
      }
      openDetail(id)
    },
    [openDetail, selected.size, toggleSelected],
  )

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-row">
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-zinc-50/80 dark:bg-zinc-900/80">
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
          <label htmlFor="calendar-dock-list" className="shrink-0 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            {t('calendarDock.listHeading')}
          </label>
          <select
            id="calendar-dock-list"
            value={dockListId}
            onChange={(e) => setDockListId(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-900 outline-none focus:border-accent-400 focus:ring-1 focus:ring-accent-400/40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
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
            <p className="px-2 py-4 text-center text-xs text-zinc-400 dark:text-zinc-500">{t('calendarDock.empty')}</p>
          )}
          {selected.size > 0 && (
            <div className="flex items-center justify-between px-2 py-1 text-[11px] text-zinc-500 dark:text-zinc-400">
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
              onCompleteRequest={openCompleteWithLog}
              selection={{
                selected: selected.has(t.id),
                reveal: selected.size > 0,
                onToggle: () => toggleSelected(t.id),
                // 選択中の行なら選択中のすべてに、それ以外はその行だけに効かせる（To-Do 一覧と同じ）
                onContextMenu: (e) =>
                  setMenu({ x: e.clientX, y: e.clientY, taskIds: selected.has(t.id) && selected.size > 1 ? [...selected] : [t.id] }),
              }}
              dragGroupIds={getDragGroupIds(t.id)}
              onNativeDragEnd={clearSelected}
            />
          ))}
        </div>
      </div>
      {detailTask && <TaskDetail task={detailTask} onClose={closeDetail} />}
      {completeWithLogModal}
      {menu && <TaskContextMenu {...menu} onClose={() => setMenu(null)} onDone={clearSelected} onOpenDetail={openDetail} />}
    </div>
  )
}
