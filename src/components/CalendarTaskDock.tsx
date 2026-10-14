import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { unplannedListIds } from '../lib/listKind'
import { isActiveTask } from '../lib/taskLifecycle'
import { compareByOrder } from '../lib/orderCompare'
import { colorLabelText, NO_LABEL, todoColorLabels } from '../lib/todoColorLabels'
import { TaskItem } from './TaskItem'
import { useTaskListSelection } from '../hooks/useTaskListSelection'
import { useBulkTaskActions } from '../hooks/useBulkTaskActions'
import { EmptyState } from './ui/EmptyState'
import { CheckCircleIcon } from './icons'
import { chipClass } from './ui/chipClass'
import { ColorDot } from './ui/FilterChips'
import { openTaskDetail, openTaskMenu } from '../lib/overlays'
import { META_TEXT } from './ui/textClass'
import { isLogTask } from '../types/task'
import { colorVars } from '../lib/logCategoryColors'
import { NEUTRAL_HEX } from '../lib/googleColors'

/**
 * カレンダーの「時間未定のタスク」: 時刻の無い To-Do（全部。いつか・チェックリストは入れない）を締切の近い順に。
 * To-Do ナビと同じラベル（色）で絞る（To-Do はリストで分けずラベルで分ける）
 */
export function CalendarTaskDock() {
  const { t } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const lists = useTaskStore((s) => s.lists)
  const presets = useTaskStore((s) => s.timeLogTagPresets)
  const categoryColors = useTaskStore((s) => s.logCategoryColors)

  /** 絞っているラベルの色（`NO_LABEL` はラベルなし、null はすべて） */
  const [color, setColor] = useState<string | null>(null)
  const openDetail = openTaskDetail
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const deleteTasks = useTaskStore((s) => s.deleteTasks)
  const bulk = useBulkTaskActions()

  const excludedListIds = useMemo(() => unplannedListIds(lists), [lists])
  const unscheduled = useMemo(
    () =>
      tasks
        .filter((t) => !t.parentId && isActiveTask(t) && !excludedListIds.has(t.listId) && !(t.startTime && t.endTime))
        .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || compareByOrder(a, b)),
    [tasks, excludedListIds],
  )
  // ここにあるタスクの色だけ（To-Do ナビと同じ並び・名前）。選んでいる色は 0 件になっても残す
  const labels = useMemo(
    () => todoColorLabels(unscheduled, excludedListIds, presets, categoryColors, false, color === NO_LABEL ? null : color),
    [unscheduled, excludedListIds, presets, categoryColors, color],
  )
  const hasUnlabeled = unscheduled.some((t) => !t.color && !t.completed && !isLogTask(t))
  const filtered = useMemo(
    () =>
      color === null
        ? unscheduled
        : color === NO_LABEL
          ? unscheduled.filter((t) => !t.color)
          : unscheduled.filter((t) => t.color?.toUpperCase() === color),
    [unscheduled, color],
  )

  const active = useMemo(() => filtered.filter((t) => !t.completed && !isLogTask(t)), [filtered])
  const activeIds = useMemo(() => active.map((t) => t.id), [active])

  // 選択とキー操作は To-Do 一覧と同じ（Shift の範囲・⌘A・↑↓・Delete・⌘Enter・⌘/・Enter・Space・Esc）
  // メニューの「実行したら選択を解除」は、選択のフックを作ったあとに入れる
  const clearSelectedRef = useRef<() => void>(() => {})
  const {
    selected,
    clearSelection: clearSelected,
    makeRowClick,
    makeSelection,
    soloIds,
    listboxProps,
  } = useTaskListSelection({
    rowIds: activeIds,
    openDetail,
    toggleRow: toggleTask,
    removeRows: deleteTasks,
    completeRows: bulk.toggleComplete,
    openMenu: (m) => openTaskMenu({ kind: 'task', ...m, onDone: () => clearSelectedRef.current() }),
    resetOn: [color],
  })
  useEffect(() => {
    clearSelectedRef.current = clearSelected
  }, [clearSelected])

  const selectedInOrder = useMemo(() => active.map((t) => t.id).filter((id) => selected.has(id)), [active, selected])
  const getDragGroupIds = useCallback(
    (id: string): string[] => (selected.has(id) && selectedInOrder.length >= 2 ? selectedInOrder : soloIds(id)),
    [selected, selectedInOrder, soloIds],
  )

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-row">
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-zinc-50/80 dark:bg-zinc-900/80">
        {/* ラベルが 1 つも無ければ絞るものが無いので出さない */}
        {labels.length > 0 && (
          <div
            role="group"
            aria-label={t('calendarDock.labelFilter')}
            className="flex flex-shrink-0 flex-wrap items-center gap-1.5 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800"
          >
            <button
              type="button"
              aria-pressed={color === null}
              onClick={() => setColor(null)}
              className={chipClass({ variant: 'outline', size: 'sm', selected: color === null })}
              style={colorVars(NEUTRAL_HEX)}
            >
              {t('sidebar.views.all')}
            </button>
            {labels.map((l) => (
              <button
                key={l.hex}
                type="button"
                aria-pressed={color === l.hex}
                onClick={() => setColor(color === l.hex ? null : l.hex)}
                className={chipClass({ variant: 'outline', size: 'sm', selected: color === l.hex })}
                style={colorVars(l.hex)}
              >
                <ColorDot hex={l.hex} />
                {colorLabelText(l.hex, presets, categoryColors, t)}
              </button>
            ))}
            {(hasUnlabeled || color === NO_LABEL) && (
              <button
                type="button"
                aria-pressed={color === NO_LABEL}
                onClick={() => setColor(color === NO_LABEL ? null : NO_LABEL)}
                className={chipClass({ variant: 'outline', size: 'sm', selected: color === NO_LABEL })}
                style={colorVars(NEUTRAL_HEX)}
              >
                {t('labels.none')}
              </button>
            )}
          </div>
        )}
        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
          {active.length === 0 && <EmptyState size="sm" icon={<CheckCircleIcon strokeWidth={1} />} title={t('calendarDock.empty')} />}
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
          <div {...listboxProps} aria-label={t('calendarDock.unscheduled')} className="space-y-0.5 outline-none">
            {active.map((t) => (
              <TaskItem
                key={t.id}
                task={t}
                hideDueDatePicker
                showChildDue
                onRowClick={makeRowClick(t.id)}
                selection={makeSelection(t.id)}
                dragGroupIds={getDragGroupIds(t.id)}
                onNativeDragEnd={clearSelected}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
