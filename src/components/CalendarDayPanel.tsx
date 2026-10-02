import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'
import { enUS, ja } from 'date-fns/locale'
import { unplannedListIds } from '../lib/listKind'
import { useTaskStore } from '../store/taskStore'
import { TaskItem } from './TaskItem'
import { TaskDetail } from './TaskDetail'
import { formatDuration, timeToMinutes } from '../lib/timeGrid'
import { isOvernightTimeLog, logOverlapsDateKey, minutesOfLogOnCalendarDay, taskPlacementDate } from '../lib/taskTimeRange'
import { isActiveTask } from '../lib/taskLifecycle'
import { isSleepRecord } from '../lib/sleep'
import { useTaskDetailModal } from '../hooks/useTaskDetailModal'
import { CalendarAddTaskButton, CalendarInlineTaskAdd } from './CalendarInlineTaskAdd'
import { readDraggedTaskIds, TASK_DND_TYPE } from '../lib/useTimelineDrop'
import type { Task } from '../types/task'
import { isAppToday } from '../lib/timeZone'
import { Segmented } from './ui/Segmented'

function completionDateKey(t: Task): string {
  const raw = t.completedAt ?? t.updatedAt
  return typeof raw === 'string' ? raw.slice(0, 10) : ''
}

type DayPanelTab = 'planned' | 'log'

export function CalendarDayPanel({
  selectedDateKey,
}: {
  selectedDateKey: string
}) {
  const { t, i18n } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const calendarEvents = useTaskStore((s) => s.calendarEvents)
  const [tab, setTab] = useState<DayPanelTab>('planned')
  const [adding, setAdding] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const updateTask = useTaskStore((s) => s.updateTask)
  const asOneUndo = useTaskStore((s) => s.asOneUndo)
  const { detailTask, openDetail, closeDetail } = useTaskDetailModal(tasks)
  const dateLocale = i18n.resolvedLanguage?.startsWith('ja') ? ja : enUS

  const date = parseISO(`${selectedDateKey}T00:00:00`)
  const dateLabel = isAppToday(date)
    ? `${format(date, i18n.resolvedLanguage?.startsWith('ja') ? 'M月d日 (E)' : 'MMM d (E)', { locale: dateLocale })} · ${t('activityLog.today')}`
    : format(date, i18n.resolvedLanguage?.startsWith('ja') ? 'M月d日 (E)' : 'MMM d (E)', { locale: dateLocale })

  const lists = useTaskStore((s) => s.lists)
  // いつか・チェックリストは日付があってもカレンダーの予定として出さない
  const excludedListIds = useMemo(() => unplannedListIds(lists), [lists])
  const plannedItems = useMemo(
    () =>
      tasks
        .filter(
          (t) =>
            taskPlacementDate(t) === selectedDateKey &&
            !t.parentId &&
            !t.isTimeLog &&
            !t.completed &&
            isActiveTask(t) &&
            !excludedListIds.has(t.listId),
        )
        .sort((a, b) => {
          if (!a.startTime && b.startTime) return -1
          if (a.startTime && !b.startTime) return 1
          if (a.startTime && b.startTime) {
            return timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
          }
          return a.order - b.order
        }),
    [tasks, selectedDateKey, excludedListIds],
  )
  const externalEvents = useMemo(
    () =>
      calendarEvents
        .filter((e) => e.date === selectedDateKey)
        .sort((a, b) => {
          if (!a.startTime && b.startTime) return -1
          if (a.startTime && !b.startTime) return 1
          if (a.startTime && b.startTime) {
            return timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
          }
          return a.summary.localeCompare(b.summary)
        }),
    [calendarEvents, selectedDateKey],
  )

  const executedItems = useMemo(
    () =>
      tasks
        .filter(
          (t) =>
            !t.parentId &&
            !t.isTimeLog &&
            t.completed &&
            isActiveTask(t) &&
            !excludedListIds.has(t.listId) &&
            completionDateKey(t) === selectedDateKey,
        )
        .sort((a, b) => {
          const ta = new Date(a.completedAt ?? a.updatedAt).getTime()
          const tb = new Date(b.completedAt ?? b.updatedAt).getTime()
          return tb - ta
        }),
    [tasks, selectedDateKey, excludedListIds],
  )

  const logItems = useMemo(
    () =>
      tasks
        .filter((t) => !t.parentId && t.isTimeLog && isActiveTask(t) && logOverlapsDateKey(t, selectedDateKey))
        .sort((a, b) => {
          if (!a.startTime || !b.startTime) return a.order - b.order
          return timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
        }),
    [tasks, selectedDateKey],
  )

  const totalLoggedMinutes = useMemo(
    () =>
      logItems.reduce((acc, item) => (isSleepRecord(item) ? acc : acc + minutesOfLogOnCalendarDay(item, selectedDateKey)), 0),
    [logItems, selectedDateKey],
  )

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-row">
      <div
        className={`flex h-full min-h-0 min-w-0 flex-1 flex-col transition-colors ${
          dragOver
            ? 'bg-accent-50 ring-2 ring-inset ring-accent-400 dark:bg-accent-500/10'
            : 'bg-zinc-50/70 dark:bg-zinc-900/70'
        }`}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(TASK_DND_TYPE)) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
          setDragOver(true)
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
          setDragOver(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const ids = readDraggedTaskIds(e.dataTransfer)
          const all = useTaskStore.getState().tasks
          const moving = ids
            .map((id) => all.find((x) => x.id === id))
            .filter((x): x is Task => !!x && !x.isTimeLog && taskPlacementDate(x) !== selectedDateKey)
          if (!moving.length) return
          // この日の予定に入れる（時刻があれば保つ。期限 dueDate は変えない）
          asOneUndo(() => {
            for (const x of moving) updateTask(x.id, { scheduledDate: selectedDateKey })
          })
          setTab('planned')
        }}
      >
        <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="flex items-center justify-between gap-2">
            <h2 className="min-w-0 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{dateLabel}</h2>
            {tab === 'planned' && !adding && (
              <CalendarAddTaskButton
                onClick={() => setAdding(true)}
                className="h-6 w-6 shrink-0 p-1 opacity-70 hover:opacity-100"
              />
            )}
          </div>
          {tab === 'planned' && adding && (
            <div className="mt-2">
              <CalendarInlineTaskAdd
                dateKey={selectedDateKey}
                size="md"
                onDone={() => setAdding(false)}
              />
            </div>
          )}
        </div>

        <div className="px-4 pt-3">
          <Segmented
            role="tab"
            ariaLabel={t('calendarDayPanel.tabsAria')}
            value={tab}
            onChange={setTab}
            options={[
              { value: 'planned', label: t('calendarDayPanel.plannedTab') },
              { value: 'log', label: t('common.log') },
            ]}
          />
        </div>

        {tab === 'planned' ? (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 pt-3">
              {externalEvents.length === 0 && plannedItems.length === 0 && executedItems.length === 0 ? (
                <p className="px-3 py-4 text-xs text-zinc-400 dark:text-zinc-500">{t('calendarDayPanel.noPlanned')}</p>
              ) : (
                <>
                  {externalEvents.length > 0 && (
                    <div className="mb-2 space-y-1.5 px-2">
                      {externalEvents.map((event) => (
                        <div
                          key={event.id}
                          title={event.summary}
                          className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-left dark:border-blue-500/40 dark:bg-blue-500/10"
                        >
                          <div className="text-sm font-medium text-blue-900 dark:text-blue-100">{event.summary}</div>
                          <div className="mt-0.5 text-xs text-blue-600 dark:text-blue-300">
                            {event.startTime && event.endTime ? `${event.startTime} - ${event.endTime}` : t('weekCalendar.allDay')}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {plannedItems.map((task) => (
                    <TaskItem key={task.id} task={task} hideDueDatePicker onRowClick={() => openDetail(task.id)} />
                  ))}
                  {(externalEvents.length > 0 ||
                    plannedItems.length > 0 ||
                    executedItems.length > 0) && (
                    <div className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-700">
                      <p className="mb-2 px-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        {t('calendarDayPanel.executedSection', { count: executedItems.length })}
                      </p>
                      {executedItems.length > 0 ? (
                        <div className="space-y-0">
                          {executedItems.map((task) => (
                            <TaskItem key={task.id} task={task} hideDueDatePicker onRowClick={() => openDetail(task.id)} />
                          ))}
                        </div>
                      ) : (
                        <p className="px-2 py-1 text-xs text-zinc-400 dark:text-zinc-500">
                          {t('calendarDayPanel.noExecuted')}
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-3">
            <div className="mb-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
              {t('calendarDayPanel.totalLogged')}: <span className="font-semibold">{formatDuration(totalLoggedMinutes)}</span>
            </div>
            {logItems.length === 0 ? (
              <p className="px-1 py-2 text-xs text-zinc-400 dark:text-zinc-500">{t('calendarDayPanel.noLogs')}</p>
            ) : (
              <div className="space-y-2">
                {logItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openDetail(item.id)}
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800/70"
                  >
                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{item.title}</div>
                    <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {item.startTime && item.endTime
                        ? `${item.startTime} - ${item.endTime}${
                            isOvernightTimeLog(item) ? ` (${t('activityLog.spansNextDay', { time: item.endTime })})` : ''
                          }`
                        : t('calendarDayPanel.timeUnset')}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {detailTask ? <TaskDetail task={detailTask} onClose={closeDetail} /> : null}
    </div>
  )
}
