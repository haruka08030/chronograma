import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format, isToday, parseISO } from 'date-fns'
import { enUS, ja } from 'date-fns/locale'
import { useTaskStore } from '../store/taskStore'
import { TaskItem } from './TaskItem'
import { TaskDetail } from './TaskDetail'
import { formatDuration, timeToMinutes } from '../lib/timeGrid'
import { isOvernightTimeLog, logOverlapsDateKey, minutesOfLogOnCalendarDay } from '../lib/taskTimeRange'
import { useTaskDetailModal } from '../hooks/useTaskDetailModal'
import type { Task } from '../types/task'

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
  const { detailTask, openDetail, closeDetail } = useTaskDetailModal(tasks)
  const dateLocale = i18n.resolvedLanguage?.startsWith('ja') ? ja : enUS

  const date = parseISO(`${selectedDateKey}T00:00:00`)
  const dateLabel = isToday(date)
    ? `${format(date, i18n.resolvedLanguage?.startsWith('ja') ? 'M月d日 (E)' : 'MMM d (E)', { locale: dateLocale })} · ${t('activityLog.today')}`
    : format(date, i18n.resolvedLanguage?.startsWith('ja') ? 'M月d日 (E)' : 'MMM d (E)', { locale: dateLocale })

  const plannedItems = useMemo(
    () =>
      tasks
        .filter((t) => t.dueDate === selectedDateKey && !t.parentId && !t.isTimeLog && !t.completed)
        .sort((a, b) => {
          if (!a.startTime && b.startTime) return -1
          if (a.startTime && !b.startTime) return 1
          if (a.startTime && b.startTime) {
            return timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
          }
          return a.order - b.order
        }),
    [tasks, selectedDateKey],
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
            completionDateKey(t) === selectedDateKey,
        )
        .sort((a, b) => {
          const ta = new Date(a.completedAt ?? a.updatedAt).getTime()
          const tb = new Date(b.completedAt ?? b.updatedAt).getTime()
          return tb - ta
        }),
    [tasks, selectedDateKey],
  )

  const logItems = useMemo(
    () =>
      tasks
        .filter((t) => !t.parentId && t.isTimeLog && logOverlapsDateKey(t, selectedDateKey))
        .sort((a, b) => {
          if (!a.startTime || !b.startTime) return a.order - b.order
          return timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
        }),
    [tasks, selectedDateKey],
  )

  const totalLoggedMinutes = useMemo(
    () =>
      logItems.reduce((acc, item) => acc + minutesOfLogOnCalendarDay(item, selectedDateKey), 0),
    [logItems, selectedDateKey],
  )

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-row">
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-zinc-50/70 dark:bg-zinc-900/70">
        <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{dateLabel}</h2>
        </div>

        <div className="px-4 pt-3">
          <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 dark:border-zinc-700 dark:bg-zinc-800">
            <button
              type="button"
              onClick={() => setTab('planned')}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                tab === 'planned'
                  ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-100'
                  : 'text-zinc-500 dark:text-zinc-400'
              }`}
            >
              {t('calendarDayPanel.plannedTab')}
            </button>
            <button
              type="button"
              onClick={() => setTab('log')}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                tab === 'log'
                  ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-100'
                  : 'text-zinc-500 dark:text-zinc-400'
              }`}
            >
              {t('common.log')}
            </button>
          </div>
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
