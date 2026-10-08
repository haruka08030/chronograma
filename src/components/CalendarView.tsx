import { useState, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { format, isSameMonth } from 'date-fns'
import { unplannedListIds } from '../lib/listKind'
import type { CalendarEvent } from '../types/calendarEvent'
import { planHex, planVisualState, type PlanVisualState } from '../lib/planVisual'
import { colorVars, recordLabelKey, recordLabelKeyHex } from '../lib/logCategoryColors'
import { minutesOfLogOnCalendarDay } from '../lib/taskTimeRange'
import { DEFAULT_GOOGLE_EVENT_HEX } from '../lib/googleColors'
import { useTaskStore } from '../store/taskStore'
import { CalendarCheck } from './timeline/CalendarCheck'
import { readDraggedTaskIds } from '../lib/useTimelineDrop'
import { beginCalendarItemNativeDrag } from '../lib/calendarItemDrag'
import {
  canEditGoogleEvent,
  getDraggedGoogleEvent,
  GOOGLE_EVENT_DND_TYPE,
  moveGoogleEvent,
  setDraggedGoogleEvent,
} from '../lib/googleEventEdit'
import { movedGoogleEventTiming } from '../lib/googleCalendar'
import { isActiveTask } from '../lib/taskLifecycle'
import { calendarDayKey, dueMarkDayKey, keepsTimeSlot } from '../lib/dayPlan'
import { FlagIcon } from './icons'
import { DUE_TONE_CLASS, type DateTone } from './ui/dueTone'
import { dueToneOf } from '../lib/dueTone'
import { useGoogleCalendarEvents } from '../hooks/useGoogleCalendarEvents'
import { CalendarAddTaskButton, CalendarInlineTaskAdd } from './CalendarInlineTaskAdd'
import { isAppToday } from '../lib/timeZone'
import { dayMarkerClass } from '../lib/dayMarker'
import { acceptTaskDrag, DROP_HIGHLIGHT_CLASS, isTaskDrag, startTaskDrag } from '../lib/taskDrag'
import { toDateKey } from '../lib/dateKey'
import { formatDurationShort } from '../lib/timeGrid'
import { openTaskDetail, openTaskMenu } from '../lib/overlays'
import { PAGE_SCROLL_CLASS } from './ui/layoutClass'
import { movedToDateLabel } from '../lib/moveToast'
import { isEventTask, isLogTask, planKindOf } from '../types/task'
import { useSwipeNav } from '../hooks/useSwipeNav'
import { useTouchContextMenu } from '../hooks/useTouchContextMenu'
import { tip } from '../lib/tooltip'
import { useHolidayName } from '../hooks/useHolidayName'
import { HolidayLabel } from './calendar/HolidayLabel'
import { useWeekStartsOn } from '../hooks/useWeekStartsOn'
import { calendarWeekEnd, monthGridDays, weekdayLabelsFrom } from '../lib/weekStart'

/** Google の予定も、タスクと同じく終わったら灰色にする */
function eventState(e: CalendarEvent, key: string): PlanVisualState {
  return planVisualState({ completed: false, startTime: e.startTime, endTime: e.endTime }, key)
}

/** 月のマスの 1 行: Google の終日予定は薄い塗りの帯、それ以外（時刻つきの予定・To-Do）は「● 時刻 タイトル」の文字だけ */
function itemClass(allDay: boolean, state: PlanVisualState): string {
  if (allDay) return state === 'upcoming' ? 'gc-plan' : 'gc-missed'
  return state === 'upcoming' ? 'text-zinc-700 dark:text-zinc-200' : 'text-zinc-400 dark:text-zinc-500'
}

/** 月のマスに並べる行の数（これを超えると最後の行を「他 N 件」にする） */
const MONTH_CELL_ROWS = 3

export function CalendarView({
  displayMonth,
  selectedDateKey,
  onSelectDate,
  onOpenDay,
  onSwipe,
}: {
  displayMonth: Date
  selectedDateKey?: string
  onSelectDate?: (dateKey: string) => void
  /**
   * 渡すと、マスを押したらその日を開く（スマホ幅。Google カレンダーと同じ）。
   * マスの中の行は小さくて押し分けにくいので、✓ などのボタン以外はどこを押してもその日へ
   */
  onOpenDay?: (dateKey: string) => void
  /** 横に払ったとき前後の月へ（スマホ幅） */
  onSwipe?: (dir: -1 | 1) => void
}) {
  const swipeRef = useRef<HTMLDivElement>(null)
  useSwipeNav(swipeRef, onSwipe)
  // タッチは項目の長押しで右クリックと同じメニュー
  useTouchContextMenu(swipeRef, (target) => !target.closest('[data-touch-menu]'))
  const { t } = useTranslation()
  const holidayName = useHolidayName()
  const tasks = useTaskStore((s) => s.tasks)
  const calendarEvents = useTaskStore((s) => s.calendarEvents)
  const googleCanWrite = useTaskStore((s) => s.googleCanWrite)
  const updateTask = useTaskStore((s) => s.updateTask)
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const asOneUndo = useTaskStore((s) => s.asOneUndo)
  const [addingDate, setAddingDate] = useState<string | null>(null)
  const openDetail = openTaskDetail
  // To‑Do の一覧と同じく、時間を決めた予定の ✓ は「完了＋記録」
  /** 予定を `t` で回す箇所でも使えるように */
  const tr = t
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)
  const dragTaskIdRef = useRef<string | null>(null)
  const weekStartsOn = useWeekStartsOn()
  const days = useMemo(() => monthGridDays(displayMonth, weekStartsOn), [displayMonth, weekStartsOn])

  const lists = useTaskStore((s) => s.lists)
  const excludedListIds = useMemo(() => unplannedListIds(lists), [lists])
  const logCategoryColors = useTaskStore((s) => s.logCategoryColors)
  const labelPresets = useTaskStore((s) => s.timeLogTagPresets)
  /** 日ごとの記録（分類 → 分）。月のマスでは記録を一番上に色で見せる（記録と可視化が主役） */
  const recordsByDate = useMemo(() => {
    const map = new Map<string, Map<string, number>>()
    for (const t of tasks) {
      if (!isLogTask(t) || !isActiveTask(t) || t.parentId) continue
      for (const day of days) {
        const key = toDateKey(day)
        const min = minutesOfLogOnCalendarDay(t, key)
        if (min <= 0) continue
        const byCat = map.get(key) ?? new Map<string, number>()
        const cat = recordLabelKey(t, labelPresets, logCategoryColors)
        byCat.set(cat, (byCat.get(cat) ?? 0) + min)
        map.set(key, byCat)
      }
    }
    return map
  }, [tasks, days, labelPresets, logCategoryColors])
  const tasksByDate = useMemo(() => {
    const map = new Map<string, typeof tasks>()
    for (const t of tasks) {
      if (t.parentId || isLogTask(t) || !isActiveTask(t) || excludedListIds.has(t.listId)) continue
      // 完了していれば終わらせた日へ（時刻つきも予定の日以外に終えたなら。週のタイムライン・終日の行と同じ）
      const key = calendarDayKey(t)
      if (!key) continue
      const arr = map.get(key) ?? []
      arr.push(t)
      map.set(key, arr)
    }
    return map
  }, [tasks, excludedListIds])

  /** 締切の日の印（実行日が別の日のもの）。マスは行数が限られるので、日ごとに件数と題名だけ */
  const dueByDate = useMemo(() => {
    const map = new Map<string, typeof tasks>()
    for (const t of tasks) {
      if (t.parentId || isLogTask(t) || !isActiveTask(t) || excludedListIds.has(t.listId)) continue
      const key = dueMarkDayKey(t)
      if (key) map.set(key, [...(map.get(key) ?? []), t])
    }
    return map
  }, [tasks, excludedListIds])

  const fetchRange = useMemo(() => {
    const ws = days[0]!
    const we = calendarWeekEnd(days[days.length - 1]!, weekStartsOn)
    we.setHours(23, 59, 59)
    return { ws, we }
  }, [days, weekStartsOn])
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
      <div ref={swipeRef} className={`flex flex-col ${PAGE_SCROLL_CLASS}`}>
        <div className="grid grid-cols-7 px-4 pt-4">
          {weekdayLabelsFrom(t('calendar.weekdayInitials', { returnObjects: true }) as string[], weekStartsOn).map((d) => (
            <div key={d} className="text-center text-[11px] font-medium text-zinc-400 dark:text-zinc-500 py-2">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 px-4 pb-4 flex-1">
          {days.map((day) => {
            const key = toDateKey(day)
            const dayTasks = tasksByDate.get(key) ?? []
            const dayEvents = (eventsByDate.get(key) ?? []).filter((e) => !e.isAllDay)
            // 予定と To-Do を合わせて 3 行まで。あと 1 件だけなら「他 1 件」の行の代わりにそれを出す（空きがあるのに隠さない）
            const totalItems = dayEvents.length + dayTasks.length
            const room = totalItems <= MONTH_CELL_ROWS + 1 ? totalItems : MONTH_CELL_ROWS
            const shownEvents = dayEvents.slice(0, room)
            const shownTasks = dayTasks.slice(0, room - shownEvents.length)
            const hiddenCount = totalItems - shownEvents.length - shownTasks.length
            const inMonth = isSameMonth(day, displayMonth)
            const today = isAppToday(day)
            const selected = selectedDateKey ? key === selectedDateKey : false
            const holiday = holidayName(key)

            return (
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- 月のマスを押す・ダブルクリックはマウス・指の近道（キーではマスの ＋ ボタンで追加できる）
              <div
                key={key}
                className={`group min-h-[64px] border-t border-zinc-100 p-1 transition-colors touch-manipulation dark:border-zinc-800 md:min-h-[80px] md:p-1.5 cursor-pointer
                            hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30
                            ${dragOverDate === key ? DROP_HIGHLIGHT_CLASS : ''}`}
                onClick={() => onSelectDate?.(key)}
                onClickCapture={
                  onOpenDay
                    ? (e) => {
                        if ((e.target as Element).closest('button')) return
                        e.stopPropagation()
                        onOpenDay(key)
                      }
                    : undefined
                }
                onDoubleClick={() => setAddingDate(key)}
                onDragOver={(e) => {
                  if (acceptTaskDrag(e, { googleEvents: true })) setDragOverDate(key)
                }}
                onDragLeave={() => setDragOverDate((prev) => (prev === key ? null : prev))}
                onDrop={(e) => {
                  if (!isTaskDrag(e, { googleEvents: true })) return
                  e.preventDefault()
                  setDragOverDate(null)
                  const gev = e.dataTransfer.types.includes(GOOGLE_EVENT_DND_TYPE) ? getDraggedGoogleEvent() : null
                  if (gev) {
                    // Google の予定は時刻と長さ（何日続くか）を保ったまま日だけ動かす
                    if (gev.date !== key) void moveGoogleEvent(gev, movedGoogleEventTiming(gev, key))
                    return
                  }
                  const ids = readDraggedTaskIds(e.dataTransfer)
                  const taskIds = ids.length ? ids : dragTaskIdRef.current ? [dragTaskIdRef.current] : []
                  asOneUndo(() => {
                    // 取り消しの文は最初の 1 回の分が出る（asOneUndo）
                    const label = movedToDateLabel(taskIds, tasks, key)
                    for (const taskId of taskIds) {
                      const existingTask = tasks.find((t) => t.id === taskId)
                      if (existingTask) {
                        updateTask(
                          taskId,
                          {
                            scheduledDate: key,
                            startTime: existingTask.startTime,
                            endTime: existingTask.endTime,
                            kind: planKindOf(existingTask),
                          },
                          label,
                        )
                      }
                    }
                  })
                  dragTaskIdRef.current = null
                }}
              >
                <div className="relative mb-1 flex items-center gap-1">
                  <div
                    className={`text-xs w-6 h-6 shrink-0 flex items-center justify-center rounded-full
                    ${
                      today || selected
                        ? dayMarkerClass({ today, selected })
                        : inMonth
                          ? 'text-zinc-500 dark:text-zinc-400'
                          : 'text-zinc-300 dark:text-zinc-600'
                    }`}
                  >
                    {format(day, 'd')}
                  </div>
                  {/* 祝日は日付の横に名前だけ（行を使わない。月の外の日は日付と同じく薄く）。スマホ幅は横に入らないので下の行へ。
                      ＋ は右端に重ねて置くので、名前が場所を譲るのは ＋ が見えている間（選んだマス・マウスを乗せた・キーで選んだ）だけ */}
                  {holiday && (
                    <HolidayLabel
                      name={holiday}
                      className={`min-w-0 flex-1 max-md:hidden ${inMonth ? '' : 'opacity-60'} ${
                        selected ? 'pr-5' : '[@media(hover:hover)]:group-hover:pr-5 group-focus-within:pr-5'
                      }`}
                    />
                  )}
                  <CalendarAddTaskButton
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelectDate?.(key)
                      setAddingDate(key)
                    }}
                    // マウスではマスに乗せたとき出す。タッチでは選んだマスだけに出す（全部のマスに並べるとごちゃつく。透明のまま押せる場所も作らない）
                    className={`absolute right-0 top-1 h-4 w-4 p-px transition-opacity focus-visible:opacity-100 group-hover:opacity-100 ${
                      selected ? 'opacity-60' : '[@media(hover:hover)]:opacity-0 [@media(hover:none)]:hidden'
                    }`}
                  />
                </div>
                <div className={`space-y-0.5 ${inMonth ? '' : 'opacity-60'}`}>
                  {holiday && <HolidayLabel name={holiday} wrap className="px-0.5 md:hidden" />}
                  {(() => {
                    const recs = recordsByDate.get(key)
                    if (!recs) return null
                    const total = [...recs.values()].reduce((a, b) => a + b, 0)
                    return (
                      <div
                        className="flex items-center gap-1.5 px-1 pb-0.5"
                        title={t('calendar.recordedTotal', { time: formatDurationShort(total) })}
                      >
                        <div className="flex h-1.5 min-w-0 flex-1 gap-px overflow-hidden rounded-full">
                          {[...recs.entries()].map(([cat, min]) => (
                            <div
                              key={cat}
                              className="gc-dot"
                              style={{ ...colorVars(recordLabelKeyHex(cat, logCategoryColors)), width: `${(min / total) * 100}%` }}
                            />
                          ))}
                        </div>
                        <span className="shrink-0 text-[9px] tabular-nums text-zinc-500 dark:text-zinc-400">
                          {formatDurationShort(total)}
                        </span>
                      </div>
                    )
                  })()}
                  {shownEvents.map((e) => (
                    <div
                      key={`event-${e.id}`}
                      {...tip(e.summary)}
                      data-touch-menu
                      draggable={canEditGoogleEvent(e, googleCanWrite)}
                      onDragStart={(ev) => {
                        ev.stopPropagation()
                        setDraggedGoogleEvent(e)
                        ev.dataTransfer.setData(GOOGLE_EVENT_DND_TYPE, e.id)
                        ev.dataTransfer.effectAllowed = 'move'
                      }}
                      onDragEnd={() => {
                        setDraggedGoogleEvent(null)
                        setDragOverDate(null)
                      }}
                      onContextMenu={(ev) => {
                        ev.preventDefault()
                        ev.stopPropagation()
                        openTaskMenu({ kind: 'google', x: ev.clientX, y: ev.clientY, eventId: e.id })
                      }}
                      className={`flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-[10px] leading-tight
                        ${itemClass(!e.startTime, eventState(e, key))}
                        ${canEditGoogleEvent(e, googleCanWrite) ? 'cursor-grab active:cursor-grabbing' : ''}`}
                      style={colorVars(eventState(e, key) === 'upcoming' ? (e.color ?? DEFAULT_GOOGLE_EVENT_HEX) : '#BDBDBD')}
                    >
                      {/* タスクと同じく、時刻つきは「● 15:00 タイトル」、終日は塗りの帯。色は予定ごと */}
                      {e.startTime && <span className="gc-dot h-1.5 w-1.5 shrink-0 rounded-full" aria-hidden />}
                      {e.startTime && <span className="shrink-0 opacity-70">{e.startTime}</span>}
                      <span className="truncate">{e.summary}</span>
                    </div>
                  ))}
                  {shownTasks.map((t) => (
                    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- ドラッグで動かすカード。押して開くのはマウス・指の近道（中の ✓ はボタン）
                    <div
                      key={t.id}
                      draggable
                      data-touch-menu
                      onDragStart={(e) => {
                        e.stopPropagation()
                        dragTaskIdRef.current = t.id
                        startTaskDrag(e, t.id)
                        beginCalendarItemNativeDrag()
                      }}
                      onDragEnd={() => {
                        dragTaskIdRef.current = null
                        setDragOverDate(null)
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        openDetail(t.id)
                      }}
                      // 時刻つきの予定・記録はタイムラインと同じメニュー、時刻なしのタスクは To-Do と同じメニュー
                      onContextMenu={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        openTaskMenu(
                          t.startTime || isLogTask(t)
                            ? { kind: 'event', x: e.clientX, y: e.clientY, taskId: t.id }
                            : { kind: 'task', x: e.clientX, y: e.clientY, taskIds: [t.id] },
                        )
                      }}
                      className={`flex cursor-grab items-center gap-1 truncate rounded px-1.5 py-0.5 text-[10px] leading-tight transition-colors
                        hover:bg-zinc-100 active:cursor-grabbing dark:hover:bg-zinc-800
                        ${itemClass(false, planVisualState(t, key))}`}
                      style={colorVars(planVisualState(t, key) === 'upcoming' ? planHex(t) : '#BDBDBD')}
                    >
                      {/* To-Do は時刻の有無で見た目を変えない（「✓ 15:00 タイトル」、時刻なしは「✓ タイトル」）。● の代わりに ✓ を置き、その場で完了にできる */}
                      {/* 予定（完了の無いもの）は Google の月表示と同じく ● */}
                      {isEventTask(t) ? (
                        <span aria-hidden className="gc-dot mx-0.5 h-2 w-2 shrink-0 rounded-full" />
                      ) : (
                        <CalendarCheck
                          done={t.completed}
                          label={t.completed ? tr('taskItem.markIncomplete') : tr('taskItem.markComplete')}
                          onCheck={() => toggleTask(t.id)}
                          className="text-(--c)"
                        />
                      )}
                      {/* 予定の日以外に終えたものは、その日のその時刻にやったように見えないよう時刻を付けない */}
                      {keepsTimeSlot(t) && <span className="shrink-0 opacity-70">{t.startTime}</span>}
                      <span className="truncate">{t.title}</span>
                    </div>
                  ))}
                  {(() => {
                    const due = dueByDate.get(key)
                    if (!due) return null
                    // いちばん急ぐものの色（締切切れ > 今日 > 明日 > それ以外）
                    const order: DateTone[] = ['overdue', 'today', 'tomorrow', 'future', 'past']
                    const tone = order.find((x) => due.some((d) => dueToneOf(d.dueDate!, d.dueTime, key) === x)) ?? 'future'
                    const titles = due.map((d) => (d.dueTime ? `${d.dueTime} ${d.title}` : d.title)).join('\n')
                    return (
                      <div {...tip(titles)} className={`flex items-center gap-1 px-1 text-[10px] leading-tight ${DUE_TONE_CLASS[tone]}`}>
                        <FlagIcon className="h-2.5 w-2.5 shrink-0" />
                        <span className="truncate">{due.length === 1 ? due[0]!.title : t('calendar.dueCount', { count: due.length })}</span>
                      </div>
                    )
                  })()}
                  {hiddenCount > 0 && (
                    // 件数だけ。押すとマス全体と同じくその日が開く
                    <span className="px-1.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                      {t('calendar.moreItems', { count: hiddenCount })}
                    </span>
                  )}
                  {addingDate === key && <CalendarInlineTaskAdd dateKey={key} onDone={() => setAddingDate(null)} />}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
