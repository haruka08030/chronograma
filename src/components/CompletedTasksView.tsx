import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { addDays } from 'date-fns'
import { useTaskStore } from '../store/taskStore'
import { isActiveTask } from '../lib/taskLifecycle'
import { completionDayKey } from '../lib/dayPlan'
import { fromDateKey, toDateKey } from '../lib/dateKey'
import { displayListName } from '../lib/displayListName'
import { isLogTask, type Task } from '../types/task'
import { openTaskDetail, openTaskMenu } from '../lib/overlays'
import { useBulkTaskActions } from '../hooks/useBulkTaskActions'
import { useTaskListSelection } from '../hooks/useTaskListSelection'
import { useDateFormat } from '../hooks/useDateFormat'
import { TaskItem } from './TaskItem'
import { CompletedSubtreeRows } from './todo/subtaskRows'
import { CheckCircleIcon } from './icons'
import { EmptyState } from './ui/EmptyState'
import { SectionLabel } from './ui/SectionLabel'
import { PAGE_TITLE_CLASS } from './ui/headingClass'
import { PAGE_SCROLL_CLASS } from './ui/layoutClass'
import { META_TEXT } from './ui/textClass'
import { useAppTodayKey } from '../hooks/useAppClock'
import { FilterMenuButton } from './ui/SortMenuButton'
import { FilterChips, FilterNoMatch } from './ui/FilterChips'
import { filterSub, useTaskFilterMenu } from './ui/useTaskFilterMenu'
import { COMPLETED_FILTER_KEYS, hasTaskFilter, inPeriod, matchesTaskFilter, NO_COMPLETED_FILTER, PERIOD_FILTERS } from '../lib/taskFilter'

const SUBTASK_NEST = 'border-l border-zinc-200 dark:border-zinc-700 ml-[13px] pl-3'

/**
 * 完了した To-Do をリストをまたいで集める（アーカイブ・ゴミ箱と同じ並び）。完了した日ごとに新しい順。
 * チェックリスト（使い回す）といつか（かなえた）はリストの中に残すので出さない。
 * 見出しのじょうごでリスト・ラベル・期間（過去 7 日・30 日）に絞れる（覚えておく）
 */
export function CompletedTasksView() {
  const { t } = useTranslation()
  const df = useDateFormat()
  const tasks = useTaskStore((s) => s.tasks)
  const lists = useTaskStore((s) => s.lists)
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const deleteTasks = useTaskStore((s) => s.deleteTasks)
  const bulk = useBulkTaskActions()

  const listById = useMemo(() => new Map(lists.map((l) => [l.id, l])), [lists])
  const todayKey = useAppTodayKey()
  const filter = useTaskStore((s) => s.completedFilter)
  const setFilter = useTaskStore((s) => s.setCompletedFilter)

  const { days, childrenByParent, flatIds, count, pool } = useMemo(() => {
    const byId = new Map(tasks.map((x) => [x.id, x]))
    const isTodoList = (listId: string) => (listById.get(listId)?.kind ?? 'tasks') === 'tasks'
    const isDone = (x: Task) => x.completed && !isLogTask(x) && isActiveTask(x)
    // 親も完了しているなら親の下に出す。親が未完了（サブだけ終えた）ならここで 1 行にする
    const allRoots = tasks.filter((x) => {
      if (!isDone(x) || !isTodoList(x.listId)) return false
      const parent = x.parentId ? byId.get(x.parentId) : undefined
      return !(parent && isDone(parent))
    })
    const roots = allRoots.filter((x) => matchesTaskFilter(x, filter) && inPeriod(completionDayKey(x), todayKey, filter.period))
    const children = new Map<string, Task[]>()
    for (const x of tasks) {
      if (!x.parentId || !isActiveTask(x) || isLogTask(x)) continue
      const arr = children.get(x.parentId)
      if (arr) arr.push(x)
      else children.set(x.parentId, [x])
    }
    for (const arr of children.values()) arr.sort((a, b) => a.order - b.order)

    const doneAt = (x: Task) => x.completedAt ?? x.updatedAt
    roots.sort((a, b) => doneAt(b).localeCompare(doneAt(a)))
    const grouped: { key: string; tasks: Task[] }[] = []
    for (const x of roots) {
      const key = completionDayKey(x)
      const last = grouped[grouped.length - 1]
      if (last?.key === key) last.tasks.push(x)
      else grouped.push({ key, tasks: [x] })
    }

    const flat: string[] = []
    const walk = (id: string) => {
      flat.push(id)
      for (const c of children.get(id) ?? []) walk(c.id)
    }
    for (const x of roots) walk(x.id)
    return { days: grouped, childrenByParent: children, flatIds: flat, count: roots.length, pool: allRoots }
  }, [tasks, listById, filter, todayKey])

  const filterMenu = useTaskFilterMenu({ filter, setFilter, keys: COMPLETED_FILTER_KEYS, pool })
  const periodLabel = (days: number) => t('filter.periodDays', { count: days })
  const filterEntries = [
    ...filterMenu.entries,
    filterSub({
      id: 'period',
      label: t('filter.by.period'),
      anyLabel: t('filter.any'),
      values: PERIOD_FILTERS.map((p) => ({ value: p, label: periodLabel(p) })),
      current: filter.period,
      onPick: (period) => setFilter({ period }),
    }),
  ]
  const chips = [
    ...filterMenu.chips,
    ...(filter.period ? [{ key: 'period', label: periodLabel(filter.period), onRemove: () => setFilter({ period: null }) }] : []),
  ]
  const filtering = hasTaskFilter(filter) || filter.period !== null

  const clearSelectionRef = useRef<() => void>(() => {})
  const openMenu = useCallback(
    (menu: { x: number; y: number; taskIds: string[] }) =>
      openTaskMenu({ kind: 'task', ...menu, onDone: () => clearSelectionRef.current() }),
    [],
  )
  const { clearSelection, makeRowClick, makeSelection, listboxProps } = useTaskListSelection({
    rowIds: flatIds,
    openDetail: openTaskDetail,
    toggleRow: toggleTask,
    removeRows: deleteTasks,
    completeRows: bulk.toggleComplete,
    openMenu,
    resetOn: [],
  })
  useEffect(() => {
    clearSelectionRef.current = clearSelection
  }, [clearSelection])

  const yesterdayKey = toDateKey(addDays(fromDateKey(todayKey), -1))
  const dayLabel = (key: string) =>
    key === todayKey
      ? t('common.today')
      : key === yesterdayKey
        ? t('completedView.yesterday')
        : key.slice(0, 4) === todayKey.slice(0, 4)
          ? df.monthDayWeekday(key)
          : df.shortDateWeekdayYear(key)

  const listLabel = (task: Task) => {
    const list = listById.get(task.listId)
    return list ? displayListName(list.id, list.name) : null
  }

  return (
    <div className={`flex flex-col ${PAGE_SCROLL_CLASS}`}>
      <div className="px-6 pt-8 pb-2">
        <div className="flex items-center justify-between gap-3">
          <h1 className={PAGE_TITLE_CLASS}>{t('sidebar.views.completed')}</h1>
          {/* 完了したものが 1 件もなければ絞るものがないので出さない */}
          {pool.length > 0 && <FilterMenuButton entries={filterEntries} ariaLabel={t('taskList.filterMenu')} active={filtering} />}
        </div>
        {/* 空なら下の「ありません」で分かるので件数は出さない */}
        {(days.length > 0 || chips.length > 0) && (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {days.length > 0 && <p className={META_TEXT}>{t('taskBin.count', { count })}</p>}
            <FilterChips chips={chips} />
          </div>
        )}
      </div>

      <div className="flex-1 px-4 pb-6">
        {days.length === 0 && filtering ? (
          <FilterNoMatch text={t('completedView.noMatch')} onClear={() => setFilter(NO_COMPLETED_FILTER)} className="px-1 py-2" />
        ) : days.length === 0 ? (
          <EmptyState icon={<CheckCircleIcon strokeWidth={1} />} title={t('completedView.empty')} />
        ) : (
          // 読み上げ: 日ごとの塊（group）をまとめて 1 つの listbox に（↑↓ は日をまたいで動く）
          <div {...listboxProps} aria-label={t('sidebar.views.completed')} className="outline-none">
            {days.map((day) => (
              <section key={day.key} role="group" aria-label={dayLabel(day.key)} className="pt-4 first:pt-2">
                <SectionLabel as="h2" className="px-1 pb-1">
                  {dayLabel(day.key)}
                </SectionLabel>
                <div className="space-y-0.5">
                  {day.tasks.map((task) => (
                    <div key={task.id}>
                      <TaskItem
                        task={task}
                        onRowClick={makeRowClick(task.id)}
                        selection={makeSelection(task.id)}
                        sectionLabel={listLabel(task)}
                        hideDueDatePicker
                      />
                      {CompletedSubtreeRows({
                        parentId: task.id,
                        depth: 0,
                        childrenByParent,
                        makeRowClick,
                        makeSelection,
                        onEnterCreateSibling: () => {},
                        pendingAutoEditTaskId: null,
                        subtaskNestNoDrag: SUBTASK_NEST,
                      })}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
