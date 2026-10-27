import { useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { SKIPPED_EVENT_CLASS } from '../ui/rowStateClass'
import { readDraggedTaskIds } from '../../lib/useTimelineDrop'
import { beginCalendarItemNativeDrag } from '../../lib/calendarItemDrag'
import { GOOGLE_EVENT_DND_TYPE } from '../../lib/googleEventEdit'
import type { CalendarEvent } from '../../types/calendarEvent'
import { CalendarInlineTaskAdd } from '../CalendarInlineTaskAdd'
import { isEventTask, planKindOf, type Task } from '../../types/task'
import { colorVars } from '../../lib/logCategoryColors'
import { DEFAULT_GOOGLE_EVENT_HEX } from '../../lib/googleColors'
import { googleEventVisualState, planHex, planTileClass, planVisualState } from '../../lib/planVisual'
import { CalendarCheck } from '../timeline/CalendarCheck'
import { acceptTaskDrag, DROP_HIGHLIGHT_CLASS, startTaskDrag } from '../../lib/taskDrag'
import { toDateKey } from '../../lib/dateKey'
import { openCalendarItemMenu, openTaskMenu } from '../../lib/overlays'
import { movedToDateLabel } from '../../lib/moveToast'
import { isCopyDrop, placeCopies } from '../../lib/dragCopy'
import { tip } from '../../lib/tooltip'
import { ChevronDownIcon, ChevronUpIcon } from '../icons'
import { TaskDueMark } from './TaskDueMark'
import { useNow } from '../../hooks/useAppClock'
import { HolidayLabel } from './HolidayLabel'
import { DueMark } from './DueMark'
import { useDues } from '../../hooks/useDues'
import { duesOn } from '../../lib/dues'

/** たたんだときに 1 日に出す行数（超える日は 1 行減らして「他 N 件」）。締切の印は数えずに必ず出す */
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
  openCard,
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
  openGoogleCard: (eventId: string, el?: Element | null) => void
  /** To-Do・予定・締切の印を押したときの小さなカード */
  openCard: (taskId: string, el?: Element | null) => void
}) {
  const { t } = useTranslation()
  /** 予定を `t` で回す箇所でも使えるように */
  const tr = t
  const updateTask = useTaskStore((s) => s.updateTask)
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const asOneUndo = useTaskStore((s) => s.asOneUndo)
  /** 件数の多い日もすべて出すか（たたむと 1 日 3 行まで。Google カレンダーと同じ） */
  const [expanded, setExpanded] = useState(false)
  const dues = useDues()
  // 予定が終わったら灰色にするので、分の境目で描き直す
  const now = useNow()
  const dayItems = (key: string) => ({
    holiday: holidayName(key),
    dues: duesOn(dues, key),
    events: (eventsByDate.get(key) ?? []).filter((e) => e.isAllDay),
    // 終えたもの（✓）は後ろへ。たたんだときに残るのはまだやるもの
    tasks: singleDay ? [] : [...(allDayByDate.get(key) ?? [])].sort((a, b) => Number(a.completed) - Number(b.completed)),
    due: singleDay ? [] : (dueByDate.get(key) ?? []),
  })
  const overflows = gridDays.some((day) => {
    const d = dayItems(toDateKey(day))
    return Number(d.holiday !== null) + d.dues.length + d.events.length + d.tasks.length > COLLAPSED_ROWS
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
          const { holiday, dues: dayDues, events: dayAllDayEvents, tasks: dayAllDay, due: dayDue } = dayItems(key)
          const items: ReactNode[] = [
            ...(holiday ? [<HolidayLabel key="holiday" name={holiday} className="px-1.5 py-0.5" />] : []),
            ...dayDues.map((d) => <DueMark key={`due-${d.id}`} item={d} dateKey={key} className="px-1.5 py-0.5" />),
            ...dayAllDayEvents.map((e) => {
              const hex = e.color ?? DEFAULT_GOOGLE_EVENT_HEX
              return (
                // 終日の Google の予定はアプリでは動かさない（Google の日付が開催の日。時刻つきの予定だけ自分の時間にできる、#625）
                // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- 押して開くのはマウス・指の近道（キーでは日のパネル・スケジュールから）
                <div
                  key={`event-all-day-${e.id}`}
                  {...tip(e.summary)}
                  data-block-id={`event-${e.id}`}
                  data-touch-menu
                  onClick={(ev) => openGoogleCard(e.id, ev.currentTarget)}
                  // 月・スケジュール・日のパネルと同じ Google の予定のメニュー（タッチは長押し）
                  onContextMenu={(ev) => {
                    ev.preventDefault()
                    ev.stopPropagation()
                    openTaskMenu({ kind: 'google', x: ev.clientX, y: ev.clientY, eventId: e.id })
                  }}
                  className={`${planTileClass(googleEventVisualState(e, key, now), hex)} ${e.skipped ? SKIPPED_EVENT_CLASS : ''} truncate rounded px-1.5 py-0.5
                    text-[10px] leading-tight transition-[filter] hover:brightness-95
                    cursor-pointer`}
                  style={colorVars(hex)}
                >
                  {e.summary}
                </div>
              )
            }),
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
                onClick={(e) => openCard(t.id, e.currentTarget)}
                // 予定は予定のメニュー、To-Do は To-Do のメニュー（タッチは長押し。どの表示でも同じ）
                data-touch-menu
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  openCalendarItemMenu(t, e.clientX, e.clientY)
                }}
                className={`${planTileClass(planVisualState(t, key, now), planHex(t))} flex cursor-grab items-center gap-1 rounded px-1 py-0.5
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
          ]
          // 締切の日の印（押すとカード、`TaskDueMark`）。たたんでも件数の上限に数えず必ず出す（月のマスと同じ。締切を「他 N 件」に隠さない）
          const dueItems: ReactNode[] = dayDue.map((t) => <TaskDueMark key={`due-${t.id}`} task={t} dateKey={key} onOpen={openCard} />)
          const hidden = collapsed && items.length > COLLAPSED_ROWS ? items.length - (COLLAPSED_ROWS - 1) : 0
          return (
            <div
              key={key}
              className={`min-h-[28px] border-l border-zinc-200 dark:border-zinc-700 px-0.5 py-0.5 space-y-0.5 transition-colors
                ${allDayDragOver === key || allDayMoveKey === key ? DROP_HIGHLIGHT_CLASS : ''}`}
              onDragOver={(e) => {
                if (acceptTaskDrag(e)) setAllDayDragOver(key)
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
                setAllDayDragOver((prev) => (prev === key ? null : prev))
              }}
              onDrop={(e) => {
                e.preventDefault()
                setAllDayAddDate(null)
                setAllDayDragOver(null)
                // Google の予定は終日にしない（時間は自分の時間として変えるだけで、Google の予定は書き換えない、#625）
                if (e.dataTransfer.types.includes(GOOGLE_EVENT_DND_TYPE)) return
                const ids = readDraggedTaskIds(e.dataTransfer)
                if (!ids.length) return
                // 終日の行に落とした = その日にやる ToDo（時刻は外す。期限 dueDate は変えない）。⌥ を押していたら元は残して複製を置く
                if (isCopyDrop(e)) {
                  placeCopies(ids, (t) => ({ scheduledDate: key, startTime: null, endTime: null, kind: planKindOf(t) }))
                  return
                }
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
              {dueItems}
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
