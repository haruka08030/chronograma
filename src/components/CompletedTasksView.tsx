import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { addDays } from 'date-fns'
import { useTaskStore } from '../store/taskStore'
import { isActiveTask } from '../lib/taskLifecycle'
import { completionDayKey } from '../lib/dayPlan'
import { appTodayKey } from '../lib/timeZone'
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

const SUBTASK_NEST = 'border-l border-zinc-200 dark:border-zinc-700 ml-[13px] pl-3'

/**
 * 完了した To-Do をリストをまたいで集める（アーカイブ・ゴミ箱と同じ並び）。完了した日ごとに新しい順。
 * チェックリスト（使い回す）といつか（かなえた）はリストの中に残すので出さない
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

  const { days, childrenByParent, flatIds, count } = useMemo(() => {
    const byId = new Map(tasks.map((x) => [x.id, x]))
    const isTodoList = (listId: string) => (listById.get(listId)?.kind ?? 'tasks') === 'tasks'
    const isDone = (x: Task) => x.completed && !isLogTask(x) && isActiveTask(x)
    // 親も完了しているなら親の下に出す。親が未完了（サブだけ終えた）ならここで 1 行にする
    const roots = tasks.filter((x) => {
      if (!isDone(x) || !isTodoList(x.listId)) return false
      const parent = x.parentId ? byId.get(x.parentId) : undefined
      return !(parent && isDone(parent))
    })
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
    return { days: grouped, childrenByParent: children, flatIds: flat, count: roots.length }
  }, [tasks, listById])

  const clearSelectionRef = useRef<() => void>(() => {})
  const openMenu = useCallback(
    (menu: { x: number; y: number; taskIds: string[] }) =>
      openTaskMenu({ kind: 'task', ...menu, onDone: () => clearSelectionRef.current() }),
    [],
  )
  const { clearSelection, makeRowClick, makeSelection } = useTaskListSelection({
    rowIds: flatIds,
    openDetail: openTaskDetail,
    toggleRow: toggleTask,
    removeRows: deleteTasks,
    completeRows: bulk.complete,
    openMenu,
    resetOn: [],
  })
  useEffect(() => {
    clearSelectionRef.current = clearSelection
  }, [clearSelection])

  const todayKey = appTodayKey()
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
        <h1 className={PAGE_TITLE_CLASS}>{t('sidebar.views.completed')}</h1>
        <p className={`mt-1 ${META_TEXT}`}>{t('taskBin.count', { count })}</p>
      </div>

      <div className="flex-1 px-4 pb-6">
        {days.length === 0 ? (
          <EmptyState icon={<CheckCircleIcon strokeWidth={1} />} title={t('completedView.empty')} />
        ) : (
          days.map((day) => (
            <section key={day.key} className="pt-4 first:pt-2">
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
          ))
        )}
      </div>
    </div>
  )
}
