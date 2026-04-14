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
import { HOUR_HEIGHT, HOURS, timeToY, yToTime, formatTimeLabel } from '../lib/timeGrid'

const GRID_TOTAL_HEIGHT = HOUR_HEIGHT * 24
const GUTTER_WIDTH = 56

interface CreateDrag {
  kind: 'create'
  dateKey: string
  startY: number
  currentY: number
}

interface MoveDrag {
  kind: 'move'
  taskId: string
  origDateKey: string
  origStartTime: string
  origEndTime: string
  dateKey: string
  offsetY: number
  currentY: number
}

type DragState = CreateDrag | MoveDrag

interface CreatePopup {
  dateKey: string
  startTime: string
  endTime: string
}

function TimeBlock({ task, onPointerDown, onClick }: {
  task: { id: string; title: string; startTime: string; endTime: string; completed: boolean }
  onPointerDown: (e: React.PointerEvent) => void
  onClick: () => void
}) {
  const top = timeToY(task.startTime)
  const height = Math.max(timeToY(task.endTime) - top, HOUR_HEIGHT / 4)

  return (
    <button
      onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e) }}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className={`absolute left-0.5 right-0.5 rounded-md px-1.5 py-0.5 text-[11px] leading-tight overflow-hidden cursor-grab active:cursor-grabbing
        border transition-shadow hover:shadow-md hover:z-10 select-none text-left touch-none
        ${task.completed
          ? 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-400 line-through'
          : 'bg-accent-100 dark:bg-accent-500/20 border-accent-300 dark:border-accent-500/40 text-accent-800 dark:text-accent-200'}`}
      style={{ top, height, minHeight: 18 }}
    >
      <span className="font-medium">{task.title}</span>
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

export function WeekCalendarView() {
  const [anchor, setAnchor] = useState(new Date())
  const tasks = useTaskStore((s) => s.tasks)
  const addTaskWithTime = useTaskStore((s) => s.addTaskWithTime)
  const updateTask = useTaskStore((s) => s.updateTask)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [popup, setPopup] = useState<CreatePopup | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const didMoveRef = useRef(false)

  const days = useMemo(() => {
    const ws = startOfWeek(anchor, { weekStartsOn: 1 })
    const we = endOfWeek(anchor, { weekStartsOn: 1 })
    return eachDayOfInterval({ start: ws, end: we })
  }, [anchor])

  const { allDayByDate, timedByDate } = useMemo(() => {
    const allDay = new Map<string, typeof tasks>()
    const timed = new Map<string, typeof tasks>()
    for (const t of tasks) {
      if (!t.dueDate || t.parentId) continue
      if (t.startTime && t.endTime) {
        const arr = timed.get(t.dueDate) ?? []
        arr.push(t)
        timed.set(t.dueDate, arr)
      } else {
        const arr = allDay.get(t.dueDate) ?? []
        arr.push(t)
        allDay.set(t.dueDate, arr)
      }
    }
    return { allDayByDate: allDay, timedByDate: timed }
  }, [tasks])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = HOUR_HEIGHT * 7.5
    }
  }, [])

  const weekLabel = `${format(days[0], 'M月d日', { locale: ja })} – ${format(days[6], 'M月d日', { locale: ja })}`
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

  const handleGridPointerDown = useCallback((e: React.PointerEvent, dateKey: string) => {
    if (popup) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const y = getRelativeY(e.clientY, dateKey)
    didMoveRef.current = false
    setDrag({ kind: 'create', dateKey, startY: y, currentY: y })
  }, [getRelativeY, popup])

  const handleBlockPointerDown = useCallback((e: React.PointerEvent, taskId: string, dateKey: string, startTime: string, endTime: string) => {
    if (popup) return
    const blockEl = e.currentTarget as HTMLElement
    const rect = blockEl.getBoundingClientRect()
    const offsetY = e.clientY - rect.top
    const y = getRelativeY(e.clientY, dateKey)
    didMoveRef.current = false

    const gridEl = gridRef.current
    if (gridEl) {
      gridEl.setPointerCapture(e.pointerId)
    }

    setDrag({ kind: 'move', taskId, origDateKey: dateKey, origStartTime: startTime, origEndTime: endTime, dateKey, offsetY, currentY: y })
  }, [getRelativeY, popup])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!drag) return
    const dateKey = getDateKeyFromX(e.clientX) ?? drag.dateKey
    const y = getRelativeY(e.clientY, dateKey)

    if (Math.abs(y - (drag.kind === 'create' ? drag.startY : drag.currentY)) > 3) {
      didMoveRef.current = true
    }

    if (drag.kind === 'create') {
      setDrag((prev) => prev && prev.kind === 'create' ? { ...prev, currentY: y, dateKey } : prev)
    } else {
      setDrag((prev) => prev && prev.kind === 'move' ? { ...prev, currentY: y, dateKey } : prev)
    }
  }, [drag, getRelativeY, getDateKeyFromX])

  const handlePointerUp = useCallback(() => {
    if (!drag) return

    if (drag.kind === 'create') {
      const minY = Math.min(drag.startY, drag.currentY)
      const maxY = Math.max(drag.startY, drag.currentY)
      if (maxY - minY < 5) {
        setDrag(null)
        return
      }
      setPopup({ dateKey: drag.dateKey, startTime: yToTime(minY), endTime: yToTime(maxY) })
    } else {
      if (didMoveRef.current) {
        const durationMin = timeToMinutes(drag.origEndTime) - timeToMinutes(drag.origStartTime)
        const newStartY = drag.currentY - drag.offsetY
        const newStart = yToTime(Math.max(0, newStartY))
        const newStartMin = timeToMinutes(newStart)
        const newEndMin = Math.min(newStartMin + durationMin, 24 * 60)
        const newEnd = minutesToTime(newEndMin)
        updateTask(drag.taskId, { dueDate: drag.dateKey, startTime: newStart, endTime: newEnd })
      }
    }
    setDrag(null)
  }, [drag, updateTask])

  const handleCreateDone = useCallback((title?: string) => {
    if (title && popup) {
      addTaskWithTime(title, popup.dateKey, popup.startTime, popup.endTime)
    }
    setPopup(null)
  }, [popup, addTaskWithTime])

  const dragPreview = useMemo(() => {
    if (!drag) return null
    if (drag.kind === 'create') {
      const minY = Math.min(drag.startY, drag.currentY)
      const maxY = Math.max(drag.startY, drag.currentY)
      if (maxY - minY < 2) return null
      return { kind: 'create' as const, dateKey: drag.dateKey, top: minY, height: maxY - minY, label: `${yToTime(minY)} – ${yToTime(maxY)}` }
    } else {
      if (!didMoveRef.current) return null
      const durationMin = timeToMinutes(drag.origEndTime) - timeToMinutes(drag.origStartTime)
      const newTop = Math.max(0, drag.currentY - drag.offsetY)
      const height = (durationMin / 60) * HOUR_HEIGHT
      const newStart = yToTime(newTop)
      const newEndMin = Math.min(timeToMinutes(newStart) + durationMin, 24 * 60)
      return { kind: 'move' as const, dateKey: drag.dateKey, taskId: drag.taskId, top: newTop, height, label: `${newStart} – ${minutesToTime(newEndMin)}` }
    }
  }, [drag])

  const hasAnyAllDay = useMemo(() => {
    return days.some((d) => {
      const key = format(d, 'yyyy-MM-dd')
      return (allDayByDate.get(key)?.length ?? 0) > 0
    })
  }, [days, allDayByDate])

  const movingTaskId = drag?.kind === 'move' ? drag.taskId : null

  return (
    <>
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between px-6 pt-6 pb-3 flex-shrink-0">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            {weekLabel}
          </h1>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setAnchor((a) => subWeeks(a, 1))}
              className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <button
              onClick={() => setAnchor(new Date())}
              className="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800
                         text-zinc-600 dark:text-zinc-400 transition-colors"
            >
              今週
            </button>
            <button
              onClick={() => setAnchor((a) => addWeeks(a, 1))}
              className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0 px-2">
          <div style={{ width: GUTTER_WIDTH }} className="flex-shrink-0" />
          <div className="flex-1 grid grid-cols-7">
            {days.map((day) => {
              const today = isToday(day)
              return (
                <div key={day.toISOString()} className={`text-center py-2 ${today ? 'text-accent-600 dark:text-accent-400' : 'text-zinc-500 dark:text-zinc-400'}`}>
                  <div className="text-[11px] font-medium">{format(day, 'E', { locale: ja })}</div>
                  <div className={`text-lg font-semibold inline-flex items-center justify-center w-8 h-8 rounded-full
                    ${today ? 'bg-accent-500 text-white' : ''}`}>
                    {format(day, 'd')}
                  </div>
                </div>
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
                return (
                  <div key={key} className="min-h-[28px] border-l border-zinc-100 dark:border-zinc-800 px-0.5 py-0.5 space-y-0.5">
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
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              {days.map((day) => {
                const key = format(day, 'yyyy-MM-dd')
                const dayTimed = timedByDate.get(key) ?? []
                const today = isToday(day)

                return (
                  <div
                    key={key}
                    data-datekey={key}
                    className={`relative border-l border-zinc-100 dark:border-zinc-800 cursor-crosshair
                      ${today ? 'bg-accent-50/30 dark:bg-accent-500/5' : ''}`}
                    style={{ height: GRID_TOTAL_HEIGHT }}
                    onPointerDown={(e) => handleGridPointerDown(e, key)}
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
                      <div key={t.id} style={{ opacity: movingTaskId === t.id ? 0.3 : 1 }}>
                        <TimeBlock
                          task={{ id: t.id, title: t.title, startTime: t.startTime!, endTime: t.endTime!, completed: t.completed }}
                          onPointerDown={(e) => handleBlockPointerDown(e, t.id, key, t.startTime!, t.endTime!)}
                          onClick={() => { if (!didMoveRef.current) setDetailId(t.id) }}
                        />
                      </div>
                    ))}

                    {dragPreview && dragPreview.dateKey === key && (
                      <div
                        className={`absolute left-0.5 right-0.5 rounded-md pointer-events-none z-20
                          ${dragPreview.kind === 'create'
                            ? 'bg-accent-500/20 border-2 border-accent-500/60'
                            : 'bg-accent-400/30 border-2 border-accent-500 shadow-lg'}`}
                        style={{ top: dragPreview.top, height: dragPreview.height }}
                      >
                        <span className="text-[10px] text-accent-700 dark:text-accent-300 px-1.5 font-medium">
                          {dragPreview.label}
                        </span>
                      </div>
                    )}

                    {popup && popup.dateKey === key && (
                      <InlineTimeAdd popup={popup} onDone={handleCreateDone} />
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

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function minutesToTime(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
