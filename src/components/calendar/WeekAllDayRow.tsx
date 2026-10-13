import { useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
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
import { isEventTask, planKindOf, type Task } from '../../types/task'
import { colorVars } from '../../lib/logCategoryColors'
import { DEFAULT_GOOGLE_EVENT_HEX } from '../../lib/googleColors'
import { planHex, planVisualState } from '../../lib/planVisual'
import { CalendarCheck } from '../timeline/CalendarCheck'
import { acceptTaskDrag, DROP_HIGHLIGHT_CLASS, startTaskDrag } from '../../lib/taskDrag'
import { toDateKey } from '../../lib/dateKey'
import { openTaskDetail, openTaskMenu } from '../../lib/overlays'
import { movedToDateLabel } from '../../lib/moveToast'
import { tip } from '../../lib/tooltip'
import { ChevronDownIcon, ChevronUpIcon, FlagIcon } from '../icons'
import { DUE_TONE_CLASS } from '../ui/dueTone'
import { dueToneOf } from '../../lib/dueTone'
import { HolidayLabel } from './HolidayLabel'

/** たたんだときに 1 日に出す行数（超える日は 1 行減らして「他 N 件」） */
const COLLAPSED_ROWS = 3

/** 終日の行（Google の終日の予定と、時刻の無い ToDo）。ToDo・Google の予定を落とすとその日へ移す */
export function WeekAllDayRow({
  gridDays,
  singleDay,
  gutterWidth,
  gridColsClass,
  allDayByDate,
  dueByDate,
  eventsByDate,
  holidayName,
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
  /** 締切の日の印（実行日が別の日のもの） */
  dueByDate: Map<string, Task[]>
  eventsByDate: Map<string, CalendarEvent[]>
  /** その日の祝日の名前（無ければ null）。行の先頭に灰色の文字だけで出す */
  holidayName: (dateKey: string) => string | null
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
  /** 件数の多い日もすべて出すか（たたむと 1 日 3 行まで。Google カレンダーと同じ） */
  const [expanded, setExpanded] = useState(false)
  const dayItems = (key: string) => ({
    holiday: holidayName(key),
    events: (eventsByDate.get(key) ?? []).filter((e) => e.isAllDay),
    // 終えたもの（✓）は後ろへ。たたんだときに残るのはまだやるもの
    tasks: singleDay ? [] : [...(allDayByDate.get(key) ?? [])].sort((a, b) => Number(a.completed) - Number(b.completed)),
    due: singleDay ? [] : (dueByDate.get(key) ?? []),
  })
  const overflows = gridDays.some((day) => {
    const d = dayItems(toDateKey(day))
    return Number(d.holiday !== null) + d.events.length + d.tasks.length + d.due.length > COLLAPSED_ROWS
  })
  const collapsed = overflows && !expanded
  return (
    <div
      className={`flex border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0 px-2
        ${expanded && overflows ? 'max-h-[40vh] overflow-y-auto' : ''}`}
    >
      <div style={{ width: gutterWidth }} className="flex flex-shrink-0 flex-col items-end gap-0.5 pr-2 pt-1 text-[10px] text-zinc-400">
        {t('weekCalendar.allDay')}
        {overflows && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            {...tip(expanded ? t('weekCalendar.allDayCollapse') : t('weekCalendar.allDayExpand'), { name: true })}
            className="rounded p-0.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            {expanded ? <ChevronUpIcon className="h-3.5 w-3.5" /> : <ChevronDownIcon className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
      <div className={`flex-1 grid ${gridColsClass}`}>
        {gridDays.map((day) => {
          const key = toDateKey(day)
          const { holiday, events: dayAllDayEvents, tasks: dayAllDay, due: dayDue } = dayItems(key)
          const items: ReactNode[] = [
            ...(holiday ? [<HolidayLabel key="holiday" name={holiday} className="px-1.5 py-0.5" />] : []),
            ...dayAllDayEvents.map((e) => (
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- ドラッグで動かすカード。押して開くのはマウス・指の近道
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
            )),
            ...dayAllDay.map((t) => (
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- ドラッグで動かすカード。押して開くのはマウス・指の近道（中の ✓ はボタン）
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
                {/* 予定（完了の無いもの）には ✓ を出さない */}
                {!isEventTask(t) && (
                  <CalendarCheck
                    done={t.completed}
                    label={t.completed ? tr('taskItem.markIncomplete') : tr('taskItem.markComplete')}
                    onCheck={() => toggleTask(t.id)}
                  />
                )}
                <span className="truncate">{t.title}</span>
              </div>
            )),
            // 締切の日の印。塗らずに締切の色の文字と旗だけ（置いた日のチップと見分ける）。押すと詳細
            ...dayDue.map((t) => {
              const label = t.dueTime
                ? tr('weekCalendar.dueMarkTime', { title: t.title, time: t.dueTime })
                : tr('weekCalendar.dueMark', { title: t.title })
              return (
                <button
                  key={`due-${t.id}`}
                  type="button"
                  onClick={() => openDetail(t.id)}
                  {...tip(label)}
                  className={`flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[10px] leading-tight hover:bg-zinc-100 dark:hover:bg-zinc-800 ${DUE_TONE_CLASS[dueToneOf(t.dueDate!, t.dueTime, key)]}`}
                >
                  <FlagIcon className="h-2.5 w-2.5 shrink-0" />
                  <span className="truncate">{t.dueTime ? `${t.dueTime} ${t.title}` : t.title}</span>
                </button>
              )
            }),
          ]
          const hidden = collapsed && items.length > COLLAPSED_ROWS ? items.length - (COLLAPSED_ROWS - 1) : 0
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
                  // 同じ日の終日の予定に戻しただけなら Google へ書き込まない
                  if (gev.isAllDay && cur.date === key) return
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
                    const kind = planKindOf(useTaskStore.getState().tasks.find((x) => x.id === id))
                    updateTask(id, { scheduledDate: key, startTime: null, endTime: null, kind }, label)
                  }
                })
              }}
            >
              {hidden ? items.slice(0, COLLAPSED_ROWS - 1) : items}
              {hidden > 0 && (
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="w-full rounded px-1.5 py-0.5 text-left text-[10px] leading-tight font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  {tr('calendar.moreItems', { count: hidden })}
                </button>
              )}
              {allDayAddDate === key && <CalendarInlineTaskAdd dateKey={key} onDone={() => setAllDayAddDate(null)} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}
