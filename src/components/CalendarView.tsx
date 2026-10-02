import { useState, useMemo, useRef } from 'react'
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
import { unplannedListIds } from '../lib/listKind'
import type { CalendarEvent } from '../types/calendarEvent'
import { planHex, planVisualState, type PlanVisualState } from '../lib/planVisual'
import { categoryHex, colorVars } from '../lib/logCategoryColors'
import { minutesOfLogOnCalendarDay } from '../lib/taskTimeRange'
import { DEFAULT_GOOGLE_EVENT_HEX } from '../lib/googleColors'
import { useTaskStore } from '../store/taskStore'
import { TaskDetail } from './TaskDetail'
import { readDraggedTaskIds, TASK_DND_TYPE } from '../lib/useTimelineDrop'
import { beginCalendarItemNativeDrag } from '../lib/calendarItemDrag'
import {
  canEditGoogleEvent,
  getDraggedGoogleEvent,
  GOOGLE_EVENT_DND_TYPE,
  moveGoogleEvent,
  setDraggedGoogleEvent,
} from '../lib/googleEventEdit'
import { isListedTimeLog } from '../lib/timeLogTask'
import { isActiveTask } from '../lib/taskLifecycle'
import { taskPlacementDate } from '../lib/taskTimeRange'
import { useGoogleCalendarEvents } from '../hooks/useGoogleCalendarEvents'
import { useTaskDetailModal } from '../hooks/useTaskDetailModal'
import { CalendarAddTaskButton, CalendarInlineTaskAdd } from './CalendarInlineTaskAdd'

/** 月のマス用の短い時間表記（3h20 / 45m） */
function formatMinutesShort(m: number): string {
  const h = Math.floor(m / 60)
  const min = m % 60
  return h > 0 ? `${h}h${min ? String(min).padStart(2, '0') : ''}` : `${min}m`
}

/** Google の予定も、タスクと同じく終わったら灰色にする */
function eventState(e: CalendarEvent, key: string): PlanVisualState {
  return planVisualState({ completed: false, startTime: e.startTime, endTime: e.endTime }, key)
}

/** 月のマスの 1 行: 終日は薄い塗りの帯、時刻つきは「● 時刻 タイトル」の文字だけ */
function itemClass(allDay: boolean, state: PlanVisualState): string {
  if (allDay) return state === 'upcoming' ? 'gc-plan' : 'gc-missed'
  return state === 'upcoming' ? 'text-zinc-700 dark:text-zinc-200' : 'text-zinc-400 dark:text-zinc-500'
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
  const googleCanWrite = useTaskStore((s) => s.googleCanWrite)
  const updateTask = useTaskStore((s) => s.updateTask)
  const asOneUndo = useTaskStore((s) => s.asOneUndo)
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

  const lists = useTaskStore((s) => s.lists)
  const excludedListIds = useMemo(() => unplannedListIds(lists), [lists])
  const listColorById = useMemo(() => new Map(lists.map((l) => [l.id, l.color])), [lists])
  const logCategoryColors = useTaskStore((s) => s.logCategoryColors)
  /** 日ごとの記録（分類 → 分）。月のマスでは記録を一番上に色で見せる（記録と可視化が主役） */
  const recordsByDate = useMemo(() => {
    const map = new Map<string, Map<string, number>>()
    for (const t of tasks) {
      if (!isListedTimeLog(t) || !isActiveTask(t) || t.parentId) continue
      for (const day of days) {
        const key = format(day, 'yyyy-MM-dd')
        const min = minutesOfLogOnCalendarDay(t, key)
        if (min <= 0) continue
        const byCat = map.get(key) ?? new Map<string, number>()
        const cat = t.tags[0] ?? ''
        byCat.set(cat, (byCat.get(cat) ?? 0) + min)
        map.set(key, byCat)
      }
    }
    return map
  }, [tasks, days])
  const tasksByDate = useMemo(() => {
    const map = new Map<string, typeof tasks>()
    for (const t of tasks) {
      if (t.parentId || isListedTimeLog(t) || !isActiveTask(t) || excludedListIds.has(t.listId)) continue
      const key = taskPlacementDate(t)
      if (!key) continue
      const arr = map.get(key) ?? []
      arr.push(t)
      map.set(key, arr)
    }
    return map
  }, [tasks, excludedListIds])

  const fetchRange = useMemo(() => {
    const ws = startOfWeek(startOfMonth(displayMonth), { weekStartsOn: 1 })
    const we = endOfWeek(endOfMonth(displayMonth), { weekStartsOn: 1 })
    we.setHours(23, 59, 59)
    return { ws, we }
  }, [displayMonth])
  useGoogleCalendarEvents(fetchRange.ws, fetchRange.we)

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
                className={`group min-h-[64px] border-t border-zinc-100 p-1 transition-colors touch-manipulation dark:border-zinc-800 md:min-h-[80px] md:p-1.5 cursor-pointer
                            hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30
                            ${dragOverDate === key ? 'bg-accent-50 dark:bg-accent-500/10 ring-2 ring-inset ring-accent-400' : ''}`}
                onClick={() => onSelectDate?.(key)}
                onDoubleClick={() => setAddingDate(key)}
                onDragOver={(e) => { e.preventDefault(); setDragOverDate(key) }}
                onDragLeave={() => setDragOverDate((prev) => prev === key ? null : prev)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOverDate(null)
                  const gev = e.dataTransfer.types.includes(GOOGLE_EVENT_DND_TYPE) ? getDraggedGoogleEvent() : null
                  if (gev) {
                    // Google の予定は時刻を保ったまま日だけ動かす
                    if (gev.date !== key) void moveGoogleEvent(gev, { date: key, startTime: gev.startTime, endTime: gev.endTime })
                    return
                  }
                  const ids = readDraggedTaskIds(e.dataTransfer)
                  const taskIds = ids.length ? ids : (dragTaskIdRef.current ? [dragTaskIdRef.current] : [])
                  asOneUndo(() => {
                    for (const taskId of taskIds) {
                      const existingTask = tasks.find((t) => t.id === taskId)
                      if (existingTask) {
                        updateTask(taskId, {
                          scheduledDate: key,
                          startTime: existingTask.startTime,
                          endTime: existingTask.endTime,
                          isTimeLog: false,
                        })
                      }
                    }
                  })
                  dragTaskIdRef.current = null
                }}
              >
                <div className="mb-1 flex items-center justify-between gap-1">
                  <div className={`text-xs w-6 h-6 flex items-center justify-center rounded-full
                    ${today
                      ? 'bg-accent-500 text-on-accent font-semibold'
                      : selected
                        ? 'ring-2 ring-accent-400 text-accent-700 dark:text-accent-300'
                        : inMonth
                          ? 'text-zinc-500 dark:text-zinc-400'
                          : 'text-zinc-300 dark:text-zinc-600'}`}
                  >
                    {format(day, 'd')}
                  </div>
                  <CalendarAddTaskButton
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelectDate?.(key)
                      setAddingDate(key)
                    }}
                    className={`h-4 w-4 p-px opacity-0 transition-opacity focus-visible:opacity-100
                      group-hover:opacity-100 ${selected ? 'opacity-60' : ''}`}
                  />
                </div>
                <div className={`space-y-0.5 ${inMonth ? '' : 'opacity-60'}`}>
                  {(() => {
                    const recs = recordsByDate.get(key)
                    if (!recs) return null
                    const total = [...recs.values()].reduce((a, b) => a + b, 0)
                    return (
                      <div className="flex items-center gap-1.5 px-1 pb-0.5" title={t('calendar.recordedTotal', { time: formatMinutesShort(total) })}>
                        <div className="flex h-1.5 min-w-0 flex-1 gap-px overflow-hidden rounded-full">
                          {[...recs.entries()].map(([cat, min]) => (
                            <div key={cat} className="gc-dot" style={{ ...colorVars(categoryHex(cat || null, logCategoryColors)), width: `${(min / total) * 100}%` }} />
                          ))}
                        </div>
                        <span className="shrink-0 text-[9px] tabular-nums text-zinc-500 dark:text-zinc-400">{formatMinutesShort(total)}</span>
                      </div>
                    )
                  })()}
                  {dayEvents.slice(0, 2).map((e) => (
                    <div
                      key={`event-${e.id}`}
                      title={e.summary}
                      draggable={canEditGoogleEvent(e, googleCanWrite)}
                      onDragStart={(ev) => {
                        ev.stopPropagation()
                        setDraggedGoogleEvent(e)
                        ev.dataTransfer.setData(GOOGLE_EVENT_DND_TYPE, e.id)
                        ev.dataTransfer.effectAllowed = 'move'
                      }}
                      onDragEnd={() => { setDraggedGoogleEvent(null); setDragOverDate(null) }}
                      className={`flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-[10px] leading-tight
                        ${itemClass(!e.startTime, eventState(e, key))}
                        ${canEditGoogleEvent(e, googleCanWrite) ? 'cursor-grab active:cursor-grabbing' : ''}`}
                      style={colorVars(eventState(e, key) === 'upcoming' ? e.color ?? DEFAULT_GOOGLE_EVENT_HEX : '#BDBDBD')}
                    >
                      {/* タスクと同じく、時刻つきは「● 15:00 タイトル」、終日は塗りの帯。色は予定ごと */}
                      {e.startTime && <span className="gc-dot h-1.5 w-1.5 shrink-0 rounded-full" aria-hidden />}
                      {e.startTime && <span className="shrink-0 opacity-70">{e.startTime}</span>}
                      <span className="truncate">{e.summary}</span>
                    </div>
                  ))}
                  {dayTasks.slice(0, 3).map((t) => (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation()
                        dragTaskIdRef.current = t.id
                        e.dataTransfer.setData(TASK_DND_TYPE, t.id)
                        e.dataTransfer.setData('text/plain', t.id)
                        e.dataTransfer.effectAllowed = 'move'
                        beginCalendarItemNativeDrag()
                      }}
                      onDragEnd={() => { dragTaskIdRef.current = null; setDragOverDate(null) }}
                      onClick={(e) => { e.stopPropagation(); openDetail(t.id) }}
                      className={`flex cursor-grab items-center gap-1 truncate rounded px-1.5 py-0.5 text-[10px] leading-tight transition-all
                        hover:bg-zinc-100 active:cursor-grabbing dark:hover:bg-zinc-800
                        ${itemClass(!t.startTime, planVisualState(t, key))}`}
                      style={colorVars(planVisualState(t, key) === 'upcoming' ? planHex(t, listColorById) : '#BDBDBD')}
                    >
                      {/* Google と同じく、時刻つきは「● 15:00 タイトル」、終日は塗りの帯 */}
                      {t.startTime && <span className="gc-dot h-1.5 w-1.5 shrink-0 rounded-full" aria-hidden />}
                      {t.startTime && <span className="shrink-0 opacity-70">{t.startTime}</span>}
                      <span className="truncate">{t.completed ? '✓ ' : ''}{t.title}</span>
                    </div>
                  ))}
                  {(dayTasks.length > 3 || dayEvents.length > 2) && (
                    // 件数だけ。押すとマス全体と同じくその日が開く
                    <span className="px-1.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                      {t('calendar.moreItems', { count: Math.max(dayTasks.length - 3, 0) + Math.max(dayEvents.length - 2, 0) })}
                    </span>
                  )}
                  {addingDate === key && (
                    <CalendarInlineTaskAdd dateKey={key} onDone={() => setAddingDate(null)} />
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
