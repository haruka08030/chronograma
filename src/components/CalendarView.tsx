import { useState, useMemo, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isToday,
} from 'date-fns'
import { useTaskStore } from '../store/taskStore'
import { TaskDetail } from './TaskDetail'
import { TASK_DND_TYPE } from '../lib/useTimelineDrop'
import { isListedTimeLog } from '../lib/timeLogTask'
import { fetchCalendarEvents } from '../lib/googleCalendar'
import { useTaskDetailModal } from '../hooks/useTaskDetailModal'

function InlineDayAdd({ dateKey, onDone }: { dateKey: string; onDone: () => void }) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  const addTaskWithDate = useTaskStore((s) => s.addTaskWithDate)

  useEffect(() => { ref.current?.focus() }, [])

  const submit = () => {
    const trimmed = value.trim()
    if (trimmed) addTaskWithDate(trimmed, dateKey)
    onDone()
  }

  return (
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
      placeholder={t('calendar.addTaskPlaceholder')}
      className="w-full text-[10px] px-1.5 py-0.5 rounded bg-white dark:bg-zinc-800 border border-accent-400
                 outline-none text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
    />
  )
}

export function CalendarView({
  displayMonth,
  selectedDateKey,
  onSelectDate,
}: {
  displayMonth: Date
  selectedDateKey?: string
  onSelectDate?: (dateKey: string) => void
}) {
  const { t } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const calendarEvents = useTaskStore((s) => s.calendarEvents)
  const googleConnected = useTaskStore((s) => s.googleConnected)
  const setCalendarEvents = useTaskStore((s) => s.setCalendarEvents)
  const setGoogleConnected = useTaskStore((s) => s.setGoogleConnected)
  const updateTask = useTaskStore((s) => s.updateTask)
  const [addingDate, setAddingDate] = useState<string | null>(null)
  const { detailTask, openDetail, closeDetail } = useTaskDetailModal(tasks)
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)
  const dragTaskIdRef = useRef<string | null>(null)
  const days = useMemo(() => {
    const monthStart = startOfMonth(displayMonth)
    const monthEnd = endOfMonth(displayMonth)
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
    return eachDayOfInterval({ start: calStart, end: calEnd })
  }, [displayMonth])

  const tasksByDate = useMemo(() => {
    const map = new Map<string, typeof tasks>()
    for (const t of tasks) {
      if (!t.dueDate || t.parentId || isListedTimeLog(t)) continue
      const key = t.dueDate
      const arr = map.get(key) ?? []
      arr.push(t)
      map.set(key, arr)
    }
    return map
  }, [tasks])

  useEffect(() => {
    if (!googleConnected) return
    let cancelled = false

    const doFetch = async () => {
      try {
        const monthStart = startOfMonth(displayMonth)
        const monthEnd = endOfMonth(displayMonth)
        const ws = startOfWeek(monthStart, { weekStartsOn: 1 })
        const we = endOfWeek(monthEnd, { weekStartsOn: 1 })
        we.setHours(23, 59, 59)
        const events = await fetchCalendarEvents(ws, we)
        if (!cancelled) setCalendarEvents(events)
      } catch {
        if (!cancelled) {
          setGoogleConnected(false)
          setCalendarEvents([])
        }
      }
    }

    doFetch()
    return () => { cancelled = true }
  }, [displayMonth, googleConnected, setCalendarEvents, setGoogleConnected])

  const eventsByDate = useMemo(() => {
    const map = new Map<string, typeof calendarEvents>()
    for (const e of calendarEvents) {
      const arr = map.get(e.date) ?? []
      arr.push(e)
      map.set(e.date, arr)
    }
    return map
  }, [calendarEvents])

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="grid grid-cols-7 px-4 pt-4">
          {(t('calendar.weekdayInitials', { returnObjects: true }) as string[]).map((d) => (
            <div key={d} className="text-center text-[11px] font-medium text-zinc-400 dark:text-zinc-500 py-2">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 px-4 pb-4 flex-1">
          {days.map((day) => {
            const key = format(day, 'yyyy-MM-dd')
            const dayTasks = tasksByDate.get(key) ?? []
            const dayEvents = (eventsByDate.get(key) ?? []).filter((e) => !e.isAllDay)
            const inMonth = isSameMonth(day, displayMonth)
            const today = isToday(day)
            const selected = selectedDateKey ? key === selectedDateKey : false

            return (
              <div
                key={key}
                className={`min-h-[80px] border-t border-zinc-100 dark:border-zinc-800 p-1.5 cursor-pointer
                            hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors
                            ${!inMonth ? 'opacity-30' : ''}
                            ${dragOverDate === key ? 'bg-accent-50 dark:bg-accent-500/10 ring-2 ring-inset ring-accent-400' : ''}`}
                onClick={() => {
                  onSelectDate?.(key)
                  setAddingDate(key)
                }}
                onDragOver={(e) => { e.preventDefault(); setDragOverDate(key) }}
                onDragLeave={() => setDragOverDate((prev) => prev === key ? null : prev)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOverDate(null)
                  const taskId =
                    e.dataTransfer.getData(TASK_DND_TYPE)
                    || e.dataTransfer.getData('text/plain')
                    || dragTaskIdRef.current
                  if (taskId) {
                    const existingTask = tasks.find((t) => t.id === taskId)
                    if (existingTask) {
                      updateTask(taskId, {
                        dueDate: key,
                        startTime: existingTask.startTime,
                        endTime: existingTask.endTime,
                        isTimeLog: false,
                      })
                    }
                  }
                  dragTaskIdRef.current = null
                }}
              >
                <div className={`text-xs mb-1 w-6 h-6 flex items-center justify-center rounded-full
                  ${today
                    ? 'bg-accent-500 text-white font-semibold'
                    : selected
                      ? 'ring-2 ring-accent-400 text-accent-700 dark:text-accent-300'
                      : 'text-zinc-500 dark:text-zinc-400'}`}
                >
                  {format(day, 'd')}
                </div>
                <div className="space-y-0.5">
                  {dayEvents.slice(0, 2).map((e) => (
                    <div
                      key={`event-${e.id}`}
                      title={e.summary}
                      className="text-[10px] leading-tight px-1.5 py-0.5 rounded truncate bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300"
                    >
                      {e.startTime && (
                        <span className="text-[9px] opacity-60 mr-0.5">{e.startTime}</span>
                      )}
                      {e.summary}
                    </div>
                  ))}
                  {dayTasks.slice(0, 3).map((t) => (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation()
                        dragTaskIdRef.current = t.id
                        e.dataTransfer.setData('text/plain', t.id)
                        e.dataTransfer.effectAllowed = 'move'
                      }}
                      onDragEnd={() => { dragTaskIdRef.current = null; setDragOverDate(null) }}
                      onClick={(e) => { e.stopPropagation(); openDetail(t.id) }}
                      className={`text-[10px] leading-tight px-1.5 py-0.5 rounded truncate cursor-grab active:cursor-grabbing
                        hover:ring-1 hover:ring-accent-400 transition-all
                        ${t.completed
                          ? 'line-through text-zinc-400 dark:text-zinc-600'
                          : 'bg-accent-50 dark:bg-accent-500/10 text-accent-700 dark:text-accent-300'}`}
                    >
                      {t.startTime && (
                        <span className="text-[9px] opacity-60 mr-0.5">{t.startTime}</span>
                      )}
                      {t.title}
                    </div>
                  ))}
                  {(dayTasks.length > 3 || dayEvents.length > 2) && (
                    <div className="text-[10px] text-zinc-400 px-1.5">
                      +{Math.max(dayTasks.length - 3, 0) + Math.max(dayEvents.length - 2, 0)}
                    </div>
                  )}
                  {addingDate === key && (
                    <InlineDayAdd dateKey={key} onDone={() => setAddingDate(null)} />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {detailTask && <TaskDetail task={detailTask} onClose={closeDetail} />}
    </div>
  )
}
