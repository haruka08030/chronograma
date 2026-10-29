import { useMemo, useRef, useState } from 'react'
import { OverlaySuspense } from './ui/OverlaySuspense'
import { useTranslation } from 'react-i18next'
import { addDays, format } from 'date-fns'
import { useTaskStore } from '../store/taskStore'
import { useShownCalendarEvents } from '../hooks/useShownCalendarEvents'
import { SKIPPED_EVENT_CLASS } from './ui/rowStateClass'
import { useWeekBuckets } from '../hooks/useWeekBuckets'
import { useGoogleCalendarEvents } from '../hooks/useGoogleCalendarEvents'
import { useDateFormat } from '../hooks/useDateFormat'
import { useHolidayName } from '../hooks/useHolidayName'
import { HolidayLabel } from './calendar/HolidayLabel'
import { DueMark } from './calendar/DueMark'
import { useDues } from '../hooks/useDues'
import { duesOn, type DueItem } from '../lib/dues'
import { TaskItem } from './TaskItem'
import { useCalendarCards } from '../hooks/useCalendarCards'
import { CalendarCards } from './calendar/CalendarCards'
import { EmptyState } from './ui/EmptyState'
import { CalendarIcon } from './icons'
import { PAGE_SCROLL_CLASS } from './ui/layoutClass'
import { useRememberScroll } from '../hooks/useRememberScroll'
import { colorVars } from '../lib/logCategoryColors'
import { DEFAULT_GOOGLE_EVENT_HEX } from '../lib/googleColors'
import { timeToMinutes } from '../lib/timeGrid'
import { isAppToday } from '../lib/timeZone'
import { dayMarkerClass, TODAY_TEXT } from '../lib/dayMarker'
import { dateFnsLocale, fromDateKey, toDateKey } from '../lib/dateKey'
import { openCalendarItemMenu, openTaskMenu } from '../lib/overlays'
import { isEventTask, type Task } from '../types/task'
import { googleEventVisualState, planHex, planTileClass, planVisualState } from '../lib/planVisual'
import { TaskDueMark } from './calendar/TaskDueMark'
import { useNow } from '../hooks/useAppClock'
import { useTouchContextMenu } from '../hooks/useTouchContextMenu'
import type { CalendarEvent } from '../types/calendarEvent'
import { compareByOrder } from '../lib/orderCompare'
import { ShowMoreButton } from './ui/ShowMoreButton'

/** 最初に並べる日数と「さらに表示」で足す日数 */
const SCHEDULE_PAGE_DAYS = 30

/** 終日が先、あとは始まる時刻の順 */
function byTime(a: { startTime?: string | null }, b: { startTime?: string | null }): number {
  if (!a.startTime && b.startTime) return -1
  if (a.startTime && !b.startTime) return 1
  if (a.startTime && b.startTime) return timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
  return 0
}

/**
 * スケジュール（Google カレンダーと同じ予定の一覧）: 選んだ日から先の予定・To‑Do・Google の予定を日付ごとに縦に並べる。
 * 何も無い日は出さない。日付を押すとその日の 1 日表示、行は日のパネルと同じ（押すと小さなカード・✓ で完了）
 */
export function CalendarScheduleView({ startDateKey, onOpenDay }: { startDateKey: string; onOpenDay: (dateKey: string) => void }) {
  const { t, i18n } = useTranslation()
  const scrollRef = useRef<HTMLDivElement>(null)
  useRememberScroll(scrollRef, `schedule:${startDateKey}`)
  // タッチは行の長押しで右クリックと同じメニュー（月・週と同じ）
  useTouchContextMenu(scrollRef, (target) => !target.closest('[data-touch-menu],[data-task-row]'))
  // 予定が終わったら灰色にするので、分の境目で描き直す
  const now = useNow()
  const df = useDateFormat()
  const holidayName = useHolidayName()
  const dues = useDues()
  const dateLocale = dateFnsLocale(i18n.resolvedLanguage)
  const tasks = useTaskStore((s) => s.tasks)
  const lists = useTaskStore((s) => s.lists)
  // やらなかった予定（#528）も薄く出す
  const calendarEvents = useShownCalendarEvents()
  const [pages, setPages] = useState(1)
  // 押すと小さなカード（月・週と同じ）
  const cards = useCalendarCards()

  const days = useMemo(() => {
    const start = fromDateKey(startDateKey)
    return Array.from({ length: SCHEDULE_PAGE_DAYS * pages }, (_, i) => addDays(start, i))
  }, [startDateKey, pages])
  const { allDayByDate, timedByDate, eventsByDate, dueByDate } = useWeekBuckets(tasks, lists, calendarEvents, days)
  const range = useMemo(() => {
    const end = new Date(days[days.length - 1]!)
    end.setHours(23, 59, 59)
    return { start: days[0]!, end }
  }, [days])
  useGoogleCalendarEvents(range.start, range.end)

  const rows = useMemo(() => {
    const out: {
      key: string
      day: Date
      holiday: string | null
      dues: DueItem[]
      events: CalendarEvent[]
      tasks: Task[]
      due: Task[]
    }[] = []
    for (const day of days) {
      const key = toDateKey(day)
      // 終えた To‑Do も終えた日に出す（月・週と同じく灰色と塗りの ✓）
      const dayTasks = [...(allDayByDate.get(key) ?? []), ...(timedByDate.get(key) ?? [])].sort(
        (a, b) => byTime(a, b) || compareByOrder(a, b),
      )
      // 締切の日の印（実行日が別の日の未完了。月・週と同じ）
      const dayDue = dueByDate.get(key) ?? []
      const dayEvents = [...(eventsByDate.get(key) ?? [])].sort((a, b) => byTime(a, b) || a.summary.localeCompare(b.summary))
      // 祝日は予定が無くても出す（休みの日を見ながら予定を決められるように）
      const holiday = holidayName(key)
      // 引き落とし・期限の日（追加機能、#454）も、祝日と同じく予定が無くても出す
      const dayDues = duesOn(dues, key)
      if (dayTasks.length || dayEvents.length || holiday || dayDues.length || dayDue.length)
        out.push({ key, day, holiday, dues: dayDues, events: dayEvents, tasks: dayTasks, due: dayDue })
    }
    return out
  }, [days, allDayByDate, timedByDate, eventsByDate, dueByDate, holidayName, dues])

  return (
    <div ref={scrollRef} className={PAGE_SCROLL_CLASS}>
      <div className="mx-auto w-full max-w-2xl px-2 pb-6 pt-2 sm:px-4">
        {rows.length === 0 ? (
          <EmptyState icon={<CalendarIcon strokeWidth={1} />} title={t('calendarHub.scheduleEmpty')} />
        ) : (
          rows.map(({ key, day, holiday, dues: dayDues, events, tasks: dayTasks, due }, i) => {
            const today = isAppToday(day)
            // 月が変わるところに月の見出し（Google カレンダーと同じ）
            const newMonth = i === 0 || rows[i - 1]!.day.getMonth() !== day.getMonth()
            return (
              <section key={key}>
                {newMonth && <h3 className="px-2 pb-1 pt-4 text-sm font-semibold text-zinc-800 dark:text-zinc-100">{df.yearMonth(day)}</h3>}
                <div className="flex gap-2 border-b border-zinc-100 py-2 dark:border-zinc-800/70">
                  <button
                    type="button"
                    onClick={() => onOpenDay(key)}
                    aria-label={df.monthDayWeekday(key)}
                    className={`flex w-12 shrink-0 flex-col items-center self-start rounded-lg py-1 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                      today ? TODAY_TEXT : 'text-zinc-500 dark:text-zinc-400'
                    }`}
                  >
                    <span className="text-[11px] font-medium">{format(day, 'E', { locale: dateLocale })}</span>
                    <span
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-lg font-semibold ${dayMarkerClass({ today, selected: false })}`}
                    >
                      {format(day, 'd')}
                    </span>
                  </button>
                  <div className="min-w-0 flex-1 space-y-1">
                    {holiday && <HolidayLabel name={holiday} size="sm" className="px-1 pt-1" />}
                    {dayDues.map((d) => (
                      <DueMark key={d.id} item={d} dateKey={key} size="sm" className="px-1 pt-1" />
                    ))}
                    {events.map((event) => {
                      const hex = event.color ?? DEFAULT_GOOGLE_EVENT_HEX
                      return (
                        // 月・週と同じく、押すと小さなカード、右クリック・長押しでメニュー。時間が過ぎたらグレー
                        <button
                          key={event.id}
                          type="button"
                          data-touch-menu
                          onClick={(e) => cards.openGoogleCard(event.id, e.currentTarget)}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            openTaskMenu({ kind: 'google', x: e.clientX, y: e.clientY, eventId: event.id })
                          }}
                          className={`${planTileClass(googleEventVisualState(event, key, now), hex)} ${event.skipped ? SKIPPED_EVENT_CLASS : ''} block w-full rounded-lg px-3 py-2 text-left`}
                          style={colorVars(hex)}
                        >
                          <div className="truncate text-sm font-medium">{event.summary}</div>
                          <div className="mt-0.5 text-xs opacity-70">
                            {event.startTime && event.endTime ? `${event.startTime} – ${event.endTime}` : t('weekCalendar.allDay')}
                          </div>
                        </button>
                      )
                    })}
                    {dayTasks.map((task) =>
                      isEventTask(task) ? (
                        // 予定（完了の無いもの）は Google の予定と同じカード。時間が過ぎたらグレー
                        <button
                          key={task.id}
                          type="button"
                          data-touch-menu
                          onClick={(e) => cards.openCard(task.id, e.currentTarget)}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            openCalendarItemMenu(task, e.clientX, e.clientY)
                          }}
                          className={`${planTileClass(planVisualState(task, key, now), planHex(task))} block w-full rounded-lg px-3 py-2 text-left`}
                          style={colorVars(planHex(task))}
                        >
                          <div className="truncate text-sm font-medium">{task.title}</div>
                          <div className="mt-0.5 text-xs opacity-70">
                            {task.startTime && task.endTime ? `${task.startTime} – ${task.endTime}` : t('weekCalendar.allDay')}
                          </div>
                        </button>
                      ) : (
                        <TaskItem
                          key={task.id}
                          task={task}
                          dayKey={key}
                          hideDueDatePicker
                          calendarState={planVisualState(task, key, now)}
                          onRowClick={(e) => cards.openCard(task.id, e.currentTarget)}
                        />
                      ),
                    )}
                    {due.map((task) => (
                      <TaskDueMark key={`due-${task.id}`} task={task} dateKey={key} size="sm" onOpen={cards.openCard} />
                    ))}
                  </div>
                </div>
              </section>
            )
          })
        )}
        <ShowMoreButton onClick={() => setPages((p) => p + 1)} />
      </div>
      <OverlaySuspense>
        <CalendarCards cards={cards} />
      </OverlaySuspense>
    </div>
  )
}
