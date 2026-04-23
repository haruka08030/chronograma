import { useMemo, useState } from 'react'
import { format, isToday, parseISO } from 'date-fns'
import { ja } from 'date-fns/locale'
import { useTaskStore } from '../store/taskStore'
import { TaskItem } from './TaskItem'
import { TaskDetail } from './TaskDetail'
import { durationMinutesForTaskSlot, formatDuration, timeToMinutes } from '../lib/timeGrid'

type DayPanelTab = 'planned' | 'log'

export function CalendarDayPanel({
  selectedDateKey,
}: {
  selectedDateKey: string
}) {
  const tasks = useTaskStore((s) => s.tasks)
  const [tab, setTab] = useState<DayPanelTab>('planned')
  const [detailId, setDetailId] = useState<string | null>(null)

  const date = parseISO(`${selectedDateKey}T00:00:00`)
  const dateLabel = isToday(date)
    ? `${format(date, 'M月d日 (E)', { locale: ja })} · 今日`
    : format(date, 'M月d日 (E)', { locale: ja })

  const plannedItems = useMemo(
    () =>
      tasks
        .filter((t) => t.dueDate === selectedDateKey && !t.parentId && !t.isTimeLog)
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

  const logItems = useMemo(
    () =>
      tasks
        .filter((t) => t.dueDate === selectedDateKey && !t.parentId && t.isTimeLog)
        .sort((a, b) => {
          if (!a.startTime || !b.startTime) return a.order - b.order
          return timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
        }),
    [tasks, selectedDateKey],
  )

  const totalLoggedMinutes = useMemo(
    () =>
      logItems.reduce((acc, item) => {
        const d = durationMinutesForTaskSlot(item)
        if (!d || d <= 0) return acc
        return acc + d
      }, 0),
    [logItems],
  )

  const detailTask = detailId ? tasks.find((t) => t.id === detailId) : null

  return (
    <>
      <div className="flex h-full min-h-0 flex-col bg-zinc-50/70 dark:bg-zinc-900/70">
        <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{dateLabel}</h2>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">当日の予定/ToDo とログ</p>
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
              予定 / ToDo
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
              ログ
            </button>
          </div>
        </div>

        {tab === 'planned' ? (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 pt-3">
              {plannedItems.length === 0 ? (
                <p className="px-3 py-4 text-xs text-zinc-400 dark:text-zinc-500">この日の予定ToDoはまだありません</p>
              ) : (
                plannedItems.map((task) => (
                  <TaskItem key={task.id} task={task} onClick={() => setDetailId(task.id)} />
                ))
              )}
            </div>
          </>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-3">
            <div className="mb-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
              合計記録: <span className="font-semibold">{formatDuration(totalLoggedMinutes)}</span>
            </div>
            {logItems.length === 0 ? (
              <p className="px-1 py-2 text-xs text-zinc-400 dark:text-zinc-500">この日のログはまだありません</p>
            ) : (
              <div className="space-y-2">
                {logItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setDetailId(item.id)}
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800/70"
                  >
                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{item.title}</div>
                    <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {item.startTime && item.endTime ? `${item.startTime} - ${item.endTime}` : '時刻未設定'}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {detailTask ? <TaskDetail task={detailTask} onClose={() => setDetailId(null)} /> : null}
    </>
  )
}
