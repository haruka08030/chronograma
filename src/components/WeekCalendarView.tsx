import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isToday,
} from 'date-fns'
import { enUS, ja } from 'date-fns/locale'
import { useTaskStore } from '../store/taskStore'
import { TaskDetail } from './TaskDetail'
import {
  HOUR_HEIGHT,
  HOURS,
  timeToY,
  formatTimeLabel,
} from '../lib/timeGrid'
import {
  durationMinutesForTaskId,
  logOverlapsDateKey,
  patchAfterTimelineMove,
  taskPlacementDate,
  timeLogSegmentLayoutForDay,
} from '../lib/taskTimeRange'
import { isActiveTask } from '../lib/taskLifecycle'
import { useTimelineDrag, getResizeCursor, type CreatePopup } from '../lib/useTimelineDrag'
import { useTimelineDrop } from '../lib/useTimelineDrop'
import {
  fetchCalendarEvents,
  localizeGoogleError,
  shouldDisconnectAfterFetchError,
} from '../lib/googleCalendar'
import { useNowMinuteTick } from '../hooks/useNowMinuteTick'
import { useTaskDetailModal } from '../hooks/useTaskDetailModal'
import type { Task } from '../types/task'

const GRID_TOTAL_HEIGHT = HOUR_HEIGHT * 24
const GUTTER_WIDTH = 56

/** 週タイムラインのブロック用（列上では開始・終了時刻が必須。Google 等の外部ブロックは最小形） */
type TimeBlockTask = {
  id: string
  title: string
  startTime: string
  endTime: string
  completed: boolean
  dueDate?: string | null
  endDate?: string | null
  isTimeLog?: boolean
  parentId?: string | null
}

function TimeBlock({ task, dayKey, onPointerDown, onOpenDetail, isLog, isExternal }: {
  task: TimeBlockTask
  /** 週グリッド上の列の日付（ログのセグメント表示用） */
  dayKey?: string
  onPointerDown: (e: React.PointerEvent) => void
  onOpenDetail: () => void
  isLog?: boolean
  isExternal?: boolean
}) {
  const { t } = useTranslation()
  const top =
    isLog && dayKey
      ? (timeLogSegmentLayoutForDay(task as Task, dayKey)?.top ?? timeToY(task.startTime))
      : timeToY(task.startTime)
  const height =
    isLog && dayKey
      ? (timeLogSegmentLayoutForDay(task as Task, dayKey)?.height ??
        Math.max(timeToY(task.endTime) - timeToY(task.startTime), HOUR_HEIGHT / 4))
      : Math.max(timeToY(task.endTime) - top, HOUR_HEIGHT / 4)

  const handlePointerMoveLocal = (e: React.PointerEvent) => {
    const cursor = getResizeCursor(e)
    ;(e.currentTarget as HTMLElement).style.cursor = cursor ?? 'grab'
  }

  const logCls = isLog
    ? 'bg-emerald-50/90 dark:bg-emerald-500/15 border-emerald-300 dark:border-emerald-500/40 border-dashed text-emerald-900 dark:text-emerald-100'
    : ''
  const externalCls =
    !isLog && isExternal
      ? 'bg-blue-50 dark:bg-blue-500/15 border-blue-300 dark:border-blue-500/40 text-blue-900 dark:text-blue-100'
      : ''

  return (
    <button
      onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e) }}
      onPointerMove={handlePointerMoveLocal}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          e.stopPropagation()
          onOpenDetail()
        }
      }}
      className={`absolute left-0.5 right-0.5 rounded-md px-1.5 py-0.5 text-[11px] leading-tight overflow-hidden cursor-grab active:cursor-grabbing
        border transition-shadow hover:shadow-md hover:z-10 select-none text-left touch-none
        ${isLog
          ? logCls
          : isExternal
            ? externalCls
          : task.completed
            ? 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-400 line-through'
            : 'bg-accent-100 dark:bg-accent-500/20 border-accent-300 dark:border-accent-500/40 text-accent-800 dark:text-accent-200'}`}
      style={{ top, height, minHeight: 18 }}
    >
      <span className="font-medium">{task.title}</span>
      {isLog && <span className="ml-1 text-[9px] opacity-70">{t('common.log')}</span>}
      {!isLog && isExternal && <span className="ml-1 text-[9px] opacity-70">{t('weekCalendar.external')}</span>}
      {height >= 32 && (
        <span className="block text-[10px] opacity-70 mt-px">
          {task.startTime} – {task.endTime}
        </span>
      )}
    </button>
  )
}

function InlineTimeAdd({ popup, onDone }: { popup: CreatePopup; onDone: (title?: string) => void }) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { ref.current?.focus() }, [])

  const submit = () => {
    const trimmed = value.trim()
    onDone(trimmed || undefined)
  }

  return (
    <div
      className="absolute left-0.5 right-0.5 z-30 rounded-md border-2 border-accent-500
                 bg-white dark:bg-zinc-900 shadow-lg overflow-hidden"
      style={{ top: timeToY(popup.startTime), height: Math.max(timeToY(popup.endTime) - timeToY(popup.startTime), 40) }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-1.5 flex flex-col h-full">
        <input
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              onDone()
              return
            }
            const isSubmitEnter =
              (e.key === 'Enter' || e.key === 'NumpadEnter') && !e.nativeEvent.isComposing
            if (isSubmitEnter) submit()
          }}
          onBlur={submit}
          placeholder={t('weekCalendar.taskNamePlaceholder')}
          className="w-full text-xs bg-transparent outline-none text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
        />
        <span className="text-[10px] text-zinc-400 mt-auto">
          {popup.startTime} – {popup.endTime}
        </span>
      </div>
    </div>
  )
}

export function WeekCalendarView({
  anchor,
  selectedDateKey,
  onSelectDate,
}: {
  anchor: Date
  selectedDateKey?: string
  onSelectDate?: (dateKey: string) => void
}) {
  const { t, i18n } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const calendarEvents = useTaskStore((s) => s.calendarEvents)
  const googleConnected = useTaskStore((s) => s.googleConnected)
  const setCalendarEvents = useTaskStore((s) => s.setCalendarEvents)
  const setGoogleConnected = useTaskStore((s) => s.setGoogleConnected)
  const setGoogleConnectionError = useTaskStore((s) => s.setGoogleConnectionError)
  const addTaskWithTime = useTaskStore((s) => s.addTaskWithTime)
  const updateTask = useTaskStore((s) => s.updateTask)
  const { detailTask, openDetail, closeDetail } = useTaskDetailModal(tasks)
  const scrollRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const dateLocale = i18n.resolvedLanguage?.startsWith('ja') ? ja : enUS

  const days = useMemo(() => {
    const ws = startOfWeek(anchor, { weekStartsOn: 1 })
    const we = endOfWeek(anchor, { weekStartsOn: 1 })
    return eachDayOfInterval({ start: ws, end: we })
  }, [anchor])

  const { allDayByDate, timedByDate, timeLogsByDate } = useMemo(() => {
    const allDay = new Map<string, typeof tasks>()
    const timed = new Map<string, typeof tasks>()
    const logs = new Map<string, typeof tasks>()
    for (const t of tasks) {
      if (t.parentId || !isActiveTask(t)) continue
      if (t.isTimeLog) {
        if (!t.dueDate || !t.startTime || !t.endTime) continue
        for (const day of days) {
          const dk = format(day, 'yyyy-MM-dd')
          if (!logOverlapsDateKey(t, dk)) continue
          const arr = logs.get(dk) ?? []
          arr.push(t)
          logs.set(dk, arr)
        }
        continue
      }
      const placement = taskPlacementDate(t)
      if (!placement) continue
      if (t.startTime && t.endTime) {
        const arr = timed.get(placement) ?? []
        arr.push(t)
        timed.set(placement, arr)
      } else {
        const arr = allDay.get(placement) ?? []
        arr.push(t)
        allDay.set(placement, arr)
      }
    }
    return { allDayByDate: allDay, timedByDate: timed, timeLogsByDate: logs }
  }, [tasks, days])

  const eventsByDate = useMemo(() => {
    const map = new Map<string, typeof calendarEvents>()
    for (const e of calendarEvents) {
      const arr = map.get(e.date) ?? []
      arr.push(e)
      map.set(e.date, arr)
    }
    return map
  }, [calendarEvents])

  useEffect(() => {
    if (!googleConnected) return
    let cancelled = false

    const doFetch = async () => {
      try {
        const ws = startOfWeek(anchor, { weekStartsOn: 1 })
        const we = endOfWeek(anchor, { weekStartsOn: 1 })
        we.setHours(23, 59, 59)
        const events = await fetchCalendarEvents(ws, we)
        if (!cancelled) {
          setCalendarEvents(events)
          setGoogleConnectionError(null)
        }
      } catch (e) {
        if (!cancelled) {
          const raw = e instanceof Error ? e.message : t('account.genericError')
          setGoogleConnectionError(localizeGoogleError(raw, t))
          if (shouldDisconnectAfterFetchError(raw)) {
            setGoogleConnected(false)
            setCalendarEvents([])
          }
        }
      }
    }

    doFetch()
    return () => { cancelled = true }
  }, [anchor, googleConnected, setCalendarEvents, setGoogleConnected, setGoogleConnectionError, t])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = HOUR_HEIGHT * 7.5
    }
  }, [])

  const getRelativeY = useCallback((clientY: number, dateKey: string) => {
    if (!gridRef.current) return 0
    const cols = gridRef.current.querySelectorAll<HTMLElement>('[data-datekey]')
    for (const col of cols) {
      if (col.dataset.datekey === dateKey) {
        const rect = col.getBoundingClientRect()
        return Math.max(0, Math.min(clientY - rect.top, GRID_TOTAL_HEIGHT))
      }
    }
    return 0
  }, [])

  const getDateKeyFromX = useCallback((clientX: number): string | null => {
    if (!gridRef.current) return null
    const cols = gridRef.current.querySelectorAll<HTMLElement>('[data-datekey]')
    for (const col of cols) {
      const rect = col.getBoundingClientRect()
      if (clientX >= rect.left && clientX <= rect.right) {
        return col.dataset.datekey ?? null
      }
    }
    return null
  }, [])

  const timelineDrag = useTimelineDrag({
    getRelativeY,
    getDateKeyFromX,
    onMoveDone: (taskId, dateKey, startTime, endTime) => {
      const prev = useTaskStore.getState().tasks.find((x) => x.id === taskId)
      if (!prev) return
      updateTask(taskId, patchAfterTimelineMove(prev, dateKey, startTime, endTime))
    },
    onResizeDone: (taskId, startTime, endTime) => { updateTask(taskId, { startTime, endTime }) },
    onBlockTap: useCallback((taskId: string) => {
      openDetail(taskId)
    }, [openDetail]),
  })

  const getTaskDuration = useCallback(
    (taskId: string): number | null => durationMinutesForTaskId(tasks, taskId),
    [tasks],
  )

  const timelineDrop = useTimelineDrop({
    getRelativeY,
    getTaskDuration,
    onDrop: (taskId, dateKey, startTime, endTime) => {
      updateTask(taskId, { scheduledDate: dateKey, startTime, endTime, isTimeLog: false })
    },
  })

  const handleCreateDone = useCallback((title?: string) => {
    if (title && timelineDrag.popup) {
      addTaskWithTime(title, timelineDrag.popup.dateKey, timelineDrag.popup.startTime, timelineDrag.popup.endTime)
    }
    timelineDrag.dismissPopup()
  }, [timelineDrag, addTaskWithTime])

  const hasAnyAllDay = useMemo(() => {
    return days.some((d) => {
      const key = format(d, 'yyyy-MM-dd')
      return (allDayByDate.get(key)?.length ?? 0) > 0
    })
  }, [days, allDayByDate])

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0 px-2 pt-1">
          <div style={{ width: GUTTER_WIDTH }} className="flex-shrink-0" />
          <div className="flex-1 grid grid-cols-7">
            {days.map((day) => {
              const today = isToday(day)
              const key = format(day, 'yyyy-MM-dd')
              const selected = selectedDateKey ? selectedDateKey === key : false
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => onSelectDate?.(key)}
                  className={`text-center py-2 transition-colors ${
                    today ? 'text-accent-600 dark:text-accent-400' : 'text-zinc-500 dark:text-zinc-400'
                  }`}
                >
                  <div className="text-[11px] font-medium">{format(day, 'E', { locale: dateLocale })}</div>
                  <div className={`text-lg font-semibold inline-flex items-center justify-center w-8 h-8 rounded-full
                    ${today ? 'bg-accent-500 text-white' : selected ? 'ring-2 ring-accent-400 text-accent-700 dark:text-accent-300' : ''}`}>
                    {format(day, 'd')}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {hasAnyAllDay && (
          <div className="flex border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0 px-2">
            <div style={{ width: GUTTER_WIDTH }} className="flex-shrink-0 text-[10px] text-zinc-400 pr-2 pt-1 text-right">
              {t('weekCalendar.allDay')}
            </div>
            <div className="flex-1 grid grid-cols-7">
              {days.map((day) => {
                const key = format(day, 'yyyy-MM-dd')
                const dayAllDay = allDayByDate.get(key) ?? []
                const dayAllDayEvents = (eventsByDate.get(key) ?? []).filter((e) => e.isAllDay)
                return (
                  <div key={key} className="min-h-[28px] border-l border-zinc-100 dark:border-zinc-800 px-0.5 py-0.5 space-y-0.5">
                    {dayAllDayEvents.map((e) => (
                      <div
                        key={`event-all-day-${e.id}`}
                        title={e.summary}
                        className="text-[10px] leading-tight px-1.5 py-0.5 rounded truncate bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300"
                      >
                        {e.summary}
                      </div>
                    ))}
                    {dayAllDay.map((t) => (
                      <div
                        key={t.id}
                        onClick={() => openDetail(t.id)}
                        className={`text-[10px] leading-tight px-1.5 py-0.5 rounded truncate cursor-pointer
                          hover:ring-1 hover:ring-accent-400 transition-all
                          ${t.completed
                            ? 'line-through text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50'
                            : 'bg-accent-100 dark:bg-accent-500/15 text-accent-700 dark:text-accent-300'}`}
                      >
                        {t.title}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden px-2">
          <div className="flex" style={{ height: GRID_TOTAL_HEIGHT }}>
            <div style={{ width: GUTTER_WIDTH }} className="flex-shrink-0 relative">
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="absolute right-2 text-[11px] text-zinc-400 dark:text-zinc-500 leading-none select-none"
                  style={{ top: h * HOUR_HEIGHT - 6 }}
                >
                  {h > 0 ? formatTimeLabel(h) : ''}
                </div>
              ))}
            </div>

            <div
              ref={gridRef}
              className="flex-1 grid grid-cols-7 relative"
              onPointerMove={timelineDrag.handlePointerMove}
              onPointerUp={timelineDrag.handlePointerUp}
            >
              {days.map((day) => {
                const key = format(day, 'yyyy-MM-dd')
                const dayTimed = timedByDate.get(key) ?? []
                const dayLogs = timeLogsByDate.get(key) ?? []
                const dayTimedEvents = (eventsByDate.get(key) ?? []).filter(
                  (e) => !e.isAllDay && e.startTime && e.endTime,
                )
                const today = isToday(day)

                return (
                  <div
                    key={key}
                    data-datekey={key}
                    className={`relative border-l border-zinc-100 dark:border-zinc-800 cursor-crosshair
                      ${today ? 'bg-accent-50/30 dark:bg-accent-500/5' : ''}
                      ${selectedDateKey === key ? 'ring-1 ring-inset ring-accent-400/50' : ''}`}
                    style={{ height: GRID_TOTAL_HEIGHT }}
                    onPointerDown={(e) => {
                      onSelectDate?.(key)
                      timelineDrag.handleCreatePointerDown(e, key)
                    }}
                    onDragEnter={timelineDrop.handleDragEnter}
                    onDragOver={(e) => timelineDrop.handleDragOver(e, key)}
                    onDragLeave={timelineDrop.handleDragLeave}
                    onDrop={(e) => timelineDrop.handleDropEvent(e, key)}
                  >
                    {HOURS.map((h) => (
                      <div
                        key={h}
                        className="absolute left-0 right-0 border-t border-zinc-100 dark:border-zinc-800/60"
                        style={{ top: h * HOUR_HEIGHT }}
                      />
                    ))}
                    {HOURS.map((h) => (
                      <div
                        key={`half-${h}`}
                        className="absolute left-0 right-0 border-t border-zinc-50 dark:border-zinc-800/30 border-dashed"
                        style={{ top: h * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
                      />
                    ))}

                    {today && <NowIndicator />}

                    {dayTimed.map((t) => (
                      <div key={t.id} style={{ opacity: timelineDrag.movingTaskId === t.id ? 0.3 : 1 }}>
                        <TimeBlock
                          task={t as TimeBlockTask}
                          onPointerDown={(e) =>
                            timelineDrag.handleBlockPointerDown(e, t.id, key, t.startTime!, t.endTime!, gridRef.current, {
                              startTime: t.startTime!,
                              endTime: t.endTime!,
                              isTimeLog: false,
                            })
                          }
                          onOpenDetail={() => openDetail(t.id)}
                        />
                      </div>
                    ))}
                    {dayLogs.map((t) => (
                      <div key={`${t.id}::${key}`} style={{ opacity: timelineDrag.movingTaskId === t.id ? 0.3 : 1 }}>
                        <TimeBlock
                          task={t as TimeBlockTask}
                          dayKey={key}
                          isLog
                          onPointerDown={(e) =>
                            timelineDrag.handleBlockPointerDown(e, t.id, key, t.startTime!, t.endTime!, gridRef.current, {
                                startTime: t.startTime!,
                                endTime: t.endTime!,
                                isTimeLog: true,
                                dueDate: t.dueDate,
                                endDate: t.endDate,
                              })
                          }
                          onOpenDetail={() => openDetail(t.id)}
                        />
                      </div>
                    ))}
                    {dayTimedEvents.map((e) => (
                      <TimeBlock
                        key={`event-${e.id}`}
                        task={{
                          id: `event-${e.id}`,
                          title: e.summary,
                          startTime: e.startTime!,
                          endTime: e.endTime!,
                          completed: false,
                        }}
                        isExternal
                        onPointerDown={(evt) => {
                          evt.preventDefault()
                          evt.stopPropagation()
                        }}
                        onOpenDetail={() => {}}
                      />
                    ))}

                    {timelineDrag.dragPreview && timelineDrag.dragPreview.dateKey === key && (
                      <div
                        className={`absolute left-0.5 right-0.5 rounded-md pointer-events-none z-20
                          ${timelineDrag.dragPreview.kind === 'create'
                            ? 'bg-accent-500/20 border-2 border-accent-500/60'
                            : 'bg-accent-400/30 border-2 border-accent-500 shadow-lg'}`}
                        style={{ top: timelineDrag.dragPreview.top, height: timelineDrag.dragPreview.height }}
                      >
                        <span className="text-[10px] text-accent-700 dark:text-accent-300 px-1.5 font-medium">
                          {timelineDrag.dragPreview.label}
                        </span>
                      </div>
                    )}

                    {timelineDrop.dropPreview && timelineDrop.dropPreview.dateKey === key && (
                      <div
                        className="absolute left-0.5 right-0.5 rounded-md pointer-events-none z-20
                                   bg-accent-500/20 border-2 border-accent-500/60 border-dashed"
                        style={{ top: timelineDrop.dropPreview.top, height: timelineDrop.dropPreview.height }}
                      >
                        <span className="text-[10px] text-accent-700 dark:text-accent-300 px-1.5 font-medium">
                          {timelineDrop.dropPreview.label}
                        </span>
                      </div>
                    )}

                    {timelineDrag.popup && timelineDrag.popup.dateKey === key && (
                      <InlineTimeAdd popup={timelineDrag.popup} onDone={handleCreateDone} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {detailTask && <TaskDetail task={detailTask} onClose={closeDetail} />}
    </div>
  )
}

function NowIndicator() {
  const now = useNowMinuteTick()

  const minutes = now.getHours() * 60 + now.getMinutes()
  const top = (minutes / 60) * HOUR_HEIGHT

  return (
    <div className="absolute left-0 right-0 z-10 pointer-events-none" style={{ top }}>
      <div className="relative">
        <div className="absolute -left-1 -top-[3px] w-2 h-2 rounded-full bg-red-500" />
        <div className="h-px bg-red-500" />
      </div>
    </div>
  )
}
