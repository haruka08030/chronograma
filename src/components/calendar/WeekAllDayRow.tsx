import type { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { addDays, differenceInCalendarDays, parseISO } from 'date-fns'
import { useTaskStore } from '../../store/taskStore'
import { readDraggedTaskIds } from '../../lib/useTimelineDrop'
import { beginCalendarItemNativeDrag } from '../../lib/calendarItemDrag'
import {
  canEditGoogleEvent,
  getDraggedGoogleEvent,
  GOOGLE_EVENT_DND_TYPE,
  moveGoogleEvent,
  setDraggedGoogleEvent,
} from '../../lib/googleEventEdit'
import { googleEventTiming } from '../../lib/googleCalendar'
import type { CalendarEvent } from '../../types/calendarEvent'
import { CalendarInlineTaskAdd } from '../CalendarInlineTaskAdd'
import type { Task } from '../../types/task'
import { colorVars } from '../../lib/logCategoryColors'
import { DEFAULT_GOOGLE_EVENT_HEX } from '../../lib/googleColors'
import { planHex, planVisualState } from '../../lib/planVisual'
import { CalendarCheck } from '../timeline/CalendarCheck'
import { acceptTaskDrag, DROP_HIGHLIGHT_CLASS, startTaskDrag } from '../../lib/taskDrag'
import { toDateKey } from '../../lib/dateKey'
import { openTaskDetail, openTaskMenu } from '../../lib/overlays'
import { movedToDateLabel } from '../../lib/moveToast'
import { tip } from '../../lib/tooltip'

/** 終日の行（Google の終日の予定と、時刻の無い ToDo）。ToDo・Google の予定を落とすとその日へ移す */
export function WeekAllDayRow({
  gridDays,
  singleDay,
  gutterWidth,
  gridColsClass,
  allDayByDate,
  eventsByDate,
  allDayDragOver,
  setAllDayDragOver,
  allDayMoveKey,
  allDayAddDate,
  setAllDayAddDate,
  openGoogleCard,
}: {
  gridDays: Date[]
  singleDay: boolean
  gutterWidth: number
  gridColsClass: string
  allDayByDate: Map<string, Task[]>
  eventsByDate: Map<string, CalendarEvent[]>
  allDayDragOver: string | null
  setAllDayDragOver: Dispatch<SetStateAction<string | null>>
  allDayMoveKey: string | null
  allDayAddDate: string | null
  setAllDayAddDate: (dateKey: string | null) => void
  openGoogleCard: (eventId: string) => void
}) {
  const { t } = useTranslation()
  /** 予定を `t` で回す箇所でも使えるように */
  const tr = t
  const googleCanWrite = useTaskStore((s) => s.googleCanWrite)
  const updateTask = useTaskStore((s) => s.updateTask)
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const asOneUndo = useTaskStore((s) => s.asOneUndo)
  const openDetail = openTaskDetail
  return (
    <div className="flex border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0 px-2">
      <div style={{ width: gutterWidth }} className="flex-shrink-0 text-[10px] text-zinc-400 pr-2 pt-1 text-right">
        {t('weekCalendar.allDay')}
      </div>
      <div className={`flex-1 grid ${gridColsClass}`}>
        {gridDays.map((day) => {
          const key = toDateKey(day)
          const dayAllDay = singleDay ? [] : (allDayByDate.get(key) ?? [])
          const dayAllDayEvents = (eventsByDate.get(key) ?? []).filter((e) => e.isAllDay)
          return (
            <div
              key={key}
              className={`min-h-[28px] border-l border-zinc-200 dark:border-zinc-700 px-0.5 py-0.5 space-y-0.5 transition-colors
                ${allDayDragOver === key || allDayMoveKey === key ? DROP_HIGHLIGHT_CLASS : ''}`}
              onDragOver={(e) => {
                if (acceptTaskDrag(e, { googleEvents: true })) setAllDayDragOver(key)
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
                setAllDayDragOver((prev) => (prev === key ? null : prev))
              }}
              onDrop={(e) => {
                e.preventDefault()
                setAllDayAddDate(null)
                setAllDayDragOver(null)
                const gev = e.dataTransfer.types.includes(GOOGLE_EVENT_DND_TYPE) ? getDraggedGoogleEvent() : null
                if (gev) {
                  // 終日の Google の予定は日数を保ったまま動かす
                  const cur = googleEventTiming(gev)
                  const span = cur.endDate ? differenceInCalendarDays(parseISO(cur.endDate), parseISO(cur.date)) : 0
                  void moveGoogleEvent(gev, {
                    date: key,
                    endDate: span > 0 ? toDateKey(addDays(parseISO(key), span)) : null,
                    startTime: null,
                    endTime: null,
                  })
                  return
                }
                const ids = readDraggedTaskIds(e.dataTransfer)
                if (!ids.length) return
                // 終日の行に落とした = その日にやる ToDo（時刻は外す。期限 dueDate は変えない）
                asOneUndo(() => {
                  const label = movedToDateLabel(ids, useTaskStore.getState().tasks, key)
                  for (const id of ids) {
                    updateTask(id, { scheduledDate: key, startTime: null, endTime: null, kind: 'todo' }, label)
                  }
                })
              }}
            >
              {dayAllDayEvents.map((e) => (
                <div
                  key={`event-all-day-${e.id}`}
                  {...tip(e.summary)}
                  data-block-id={`event-${e.id}`}
                  draggable={canEditGoogleEvent(e, googleCanWrite)}
                  onDragStart={(ev) => {
                    setDraggedGoogleEvent(e)
                    ev.dataTransfer.setData(GOOGLE_EVENT_DND_TYPE, e.id)
                    ev.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragEnd={() => {
                    setDraggedGoogleEvent(null)
                    setAllDayDragOver(null)
                  }}
                  onClick={() => openGoogleCard(e.id)}
                  className={`${planVisualState({ completed: false, startTime: null, endTime: null }, key) === 'upcoming' ? 'gc-plan' : 'gc-missed'} truncate rounded px-1.5 py-0.5
                    text-[10px] leading-tight transition-[filter] hover:brightness-95
                    ${canEditGoogleEvent(e, googleCanWrite) ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
                  style={colorVars(e.color ?? DEFAULT_GOOGLE_EVENT_HEX)}
                >
                  {e.summary}
                </div>
              ))}
              {dayAllDay.map((t) => (
                <div
                  key={t.id}
                  draggable
                  onDragStart={(e) => {
                    startTaskDrag(e, t.id)
                    beginCalendarItemNativeDrag()
                  }}
                  onDragEnd={() => setAllDayDragOver(null)}
                  onClick={() => openDetail(t.id)}
                  // 時刻の無いタスクなので To-Do と同じメニュー（タッチは長押し）
                  data-touch-menu
                  onContextMenu={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    openTaskMenu({ kind: 'task', x: e.clientX, y: e.clientY, taskIds: [t.id] })
                  }}
                  className={`${planVisualState(t, key) === 'upcoming' ? 'gc-plan' : 'gc-missed'} flex cursor-grab items-center gap-1 rounded px-1 py-0.5
                    text-[10px] leading-tight transition-[filter] hover:brightness-95 active:cursor-grabbing`}
                  style={colorVars(planHex(t))}
                >
                  <CalendarCheck
                    done={t.completed}
                    label={t.completed ? tr('taskItem.markIncomplete') : tr('taskItem.markComplete')}
                    onCheck={() => toggleTask(t.id)}
                  />
                  <span className="truncate">{t.title}</span>
                </div>
              ))}
              {allDayAddDate === key && <CalendarInlineTaskAdd dateKey={key} onDone={() => setAllDayAddDate(null)} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}
