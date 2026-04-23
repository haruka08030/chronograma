import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import {
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isToday,
  addWeeks,
  subWeeks,
} from 'date-fns'
import { ja } from 'date-fns/locale'
import { useTaskStore } from '../store/taskStore'
import { TaskDetail } from './TaskDetail'
import { HOUR_HEIGHT, HOURS, timeToY, formatTimeLabel, durationMinutesForTaskId } from '../lib/timeGrid'
import { useTimelineDrag, getResizeCursor, type CreatePopup } from '../lib/useTimelineDrag'
import { useTimelineDrop } from '../lib/useTimelineDrop'
import {
  fetchCalendarEvents,
  initGoogleAuth,
  isGoogleAvailable,
  signIn,
  signInSilent,
} from '../lib/googleCalendar'

const GRID_TOTAL_HEIGHT = HOUR_HEIGHT * 24
const GUTTER_WIDTH = 56

function TimeBlock({ task, onPointerDown, onOpenDetail, isLog, isExternal }: {
  task: { id: string; title: string; startTime: string; endTime: string; completed: boolean }
  onPointerDown: (e: React.PointerEvent) => void
  onOpenDetail: () => void
  isLog?: boolean
  isExternal?: boolean
}) {
  const top = timeToY(task.startTime)
  const height = Math.max(timeToY(task.endTime) - top, HOUR_HEIGHT / 4)

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
      {isLog && <span className="ml-1 text-[9px] opacity-70">ログ</span>}
      {!isLog && isExternal && <span className="ml-1 text-[9px] opacity-70">外部</span>}
      {height >= 32 && (
        <span className="block text-[10px] opacity-70 mt-px">
          {task.startTime} – {task.endTime}
        </span>
      )}
    </button>
  )
}

function InlineTimeAdd({ popup, onDone }: { popup: CreatePopup; onDone: (title?: string) => void }) {
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
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') onDone()
          }}
          onBlur={submit}
          placeholder="タスク名"
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
  selectedDateKey,
  onSelectDate,
}: {
  selectedDateKey?: string
  onSelectDate?: (dateKey: string) => void
}) {
  const [anchor, setAnchor] = useState(new Date())
  const tasks = useTaskStore((s) => s.tasks)
  const calendarEvents = useTaskStore((s) => s.calendarEvents)
  const googleConnected = useTaskStore((s) => s.googleConnected)
  const setCalendarEvents = useTaskStore((s) => s.setCalendarEvents)
  const setGoogleAccessToken = useTaskStore((s) => s.setGoogleAccessToken)
  const addTaskWithTime = useTaskStore((s) => s.addTaskWithTime)
  const updateTask = useTaskStore((s) => s.updateTask)
  const [detailId, setDetailId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)

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
      if (!t.dueDate || t.parentId) continue
      if (t.startTime && t.endTime) {
        if (t.isTimeLog) {
          const arr = logs.get(t.dueDate) ?? []
          arr.push(t)
          logs.set(t.dueDate, arr)
        } else {
          const arr = timed.get(t.dueDate) ?? []
          arr.push(t)
          timed.set(t.dueDate, arr)
        }
      } else {
        const arr = allDay.get(t.dueDate) ?? []
        arr.push(t)
        allDay.set(t.dueDate, arr)
      }
    }
    return { allDayByDate: allDay, timedByDate: timed, timeLogsByDate: logs }
  }, [tasks])

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
        if (!isGoogleAvailable()) {
          await initGoogleAuth()
        }

        let token = useTaskStore.getState().googleAccessToken
        if (!token) {
          try {
            token = await signInSilent()
          } catch {
            token = await signIn()
          }
          if (!cancelled) setGoogleAccessToken(token)
        }

        const ws = startOfWeek(anchor, { weekStartsOn: 1 })
        const we = endOfWeek(anchor, { weekStartsOn: 1 })
        we.setHours(23, 59, 59)
        const events = await fetchCalendarEvents(ws, we, token)
        if (!cancelled) setCalendarEvents(events)
      } catch {
        if (!cancelled) setCalendarEvents([])
      }
    }

    doFetch()
    return () => { cancelled = true }
  }, [anchor, googleConnected, setCalendarEvents, setGoogleAccessToken])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = HOUR_HEIGHT * 7.5
    }
  }, [])

  const detailTask = detailId ? tasks.find((t) => t.id === detailId) : null

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
    onMoveDone: (taskId, dateKey, startTime, endTime) => { updateTask(taskId, { dueDate: dateKey, startTime, endTime }) },
    onResizeDone: (taskId, startTime, endTime) => { updateTask(taskId, { startTime, endTime }) },
    onBlockTap: useCallback((taskId: string) => {
      setDetailId(taskId)
    }, []),
  })

  const getTaskDuration = useCallback(
    (taskId: string): number | null => durationMinutesForTaskId(tasks, taskId),
    [tasks],
  )

  const timelineDrop = useTimelineDrop({
    getRelativeY,
    getTaskDuration,
    onDrop: (taskId, dateKey, startTime, endTime) => {
      updateTask(taskId, { dueDate: dateKey, startTime, endTime, isTimeLog: false })
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
    <>
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex flex-shrink-0 items-center justify-end gap-1 px-4 py-2">
          <button
            type="button"
            onClick={() => setAnchor((a) => subWeeks(a, 1))}
            className="rounded-lg p-2 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label="前の週"
          >
            <svg className="h-4 w-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setAnchor(new Date())}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            今週
          </button>
          <button
            type="button"
            onClick={() => setAnchor((a) => addWeeks(a, 1))}
            className="rounded-lg p-2 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label="次の週"
          >
            <svg className="h-4 w-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>

        <div className="flex border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0 px-2">
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
                  <div className="text-[11px] font-medium">{format(day, 'E', { locale: ja })}</div>
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
              終日
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
                        onClick={() => setDetailId(t.id)}
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
                          task={{ id: t.id, title: t.title, startTime: t.startTime!, endTime: t.endTime!, completed: t.completed }}
                          onPointerDown={(e) => timelineDrag.handleBlockPointerDown(e, t.id, key, t.startTime!, t.endTime!, gridRef.current)}
                          onOpenDetail={() => setDetailId(t.id)}
                        />
                      </div>
                    ))}
                    {dayLogs.map((t) => (
                      <div key={t.id} style={{ opacity: timelineDrag.movingTaskId === t.id ? 0.3 : 1 }}>
                        <TimeBlock
                          task={{ id: t.id, title: t.title, startTime: t.startTime!, endTime: t.endTime!, completed: t.completed }}
                          isLog
                          onPointerDown={(e) => timelineDrag.handleBlockPointerDown(e, t.id, key, t.startTime!, t.endTime!, gridRef.current)}
                          onOpenDetail={() => setDetailId(t.id)}
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

      {detailTask && (
        <TaskDetail task={detailTask} onClose={() => setDetailId(null)} />
      )}
    </>
  )
}

function NowIndicator() {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

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
