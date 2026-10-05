import { Suspense, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { addDays, format } from 'date-fns'
import { useTaskStore } from '../store/taskStore'
import { useWeekBuckets } from '../hooks/useWeekBuckets'
import { useGoogleCalendarEvents } from '../hooks/useGoogleCalendarEvents'
import { useDateFormat } from '../hooks/useDateFormat'
import { TaskItem } from './TaskItem'
import { GoogleEventPopover } from './lazyOverlays'
import { rectOf, type AnchorRect } from './timeline/anchoredCard'
import { EmptyState } from './ui/EmptyState'
import { CalendarIcon } from './icons'
import { PAGE_SCROLL_CLASS } from './ui/layoutClass'
import { colorVars } from '../lib/logCategoryColors'
import { DEFAULT_GOOGLE_EVENT_HEX } from '../lib/googleColors'
import { timeToMinutes } from '../lib/timeGrid'
import { isAppToday } from '../lib/timeZone'
import { dayMarkerClass, TODAY_TEXT } from '../lib/dayMarker'
import { dateFnsLocale, fromDateKey, toDateKey } from '../lib/dateKey'
import { openTaskDetail, openTaskMenu } from '../lib/overlays'
import type { Task } from '../types/task'
import type { CalendarEvent } from '../types/calendarEvent'

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
 * 何も無い日は出さない。日付を押すとその日の 1 日表示、行は日のパネルと同じ（押すと詳細・✓ で完了）
 */
export function CalendarScheduleView({
  startDateKey,
  onOpenDay,
}: {
  startDateKey: string
  onOpenDay: (dateKey: string) => void
}) {
  const { t, i18n } = useTranslation()
  const df = useDateFormat()
  const dateLocale = dateFnsLocale(i18n.resolvedLanguage)
  const tasks = useTaskStore((s) => s.tasks)
  const lists = useTaskStore((s) => s.lists)
  const calendarEvents = useTaskStore((s) => s.calendarEvents)
  const [pages, setPages] = useState(1)
  const [googleCard, setGoogleCard] = useState<{ eventId: string; anchor: AnchorRect } | null>(null)

  const days = useMemo(() => {
    const start = fromDateKey(startDateKey)
    return Array.from({ length: SCHEDULE_PAGE_DAYS * pages }, (_, i) => addDays(start, i))
  }, [startDateKey, pages])
  const { allDayByDate, timedByDate, eventsByDate } = useWeekBuckets(tasks, lists, calendarEvents, days)
  const range = useMemo(() => {
    const end = new Date(days[days.length - 1]!)
    end.setHours(23, 59, 59)
    return { start: days[0]!, end }
  }, [days])
  useGoogleCalendarEvents(range.start, range.end)

  const rows = useMemo(() => {
    const out: { key: string; day: Date; events: CalendarEvent[]; tasks: Task[] }[] = []
    for (const day of days) {
      const key = toDateKey(day)
      // 一覧は「これからのこと」なので、終えた To‑Do は出さない（終えた日の記録はタイムライン・日のパネル）
      const dayTasks = [...(allDayByDate.get(key) ?? []), ...(timedByDate.get(key) ?? [])]
        .filter((x) => !x.completed)
        .sort((a, b) => byTime(a, b) || a.order - b.order)
      const dayEvents = [...(eventsByDate.get(key) ?? [])].sort((a, b) => byTime(a, b) || a.summary.localeCompare(b.summary))
      if (dayTasks.length || dayEvents.length) out.push({ key, day, events: dayEvents, tasks: dayTasks })
    }
    return out
  }, [days, allDayByDate, timedByDate, eventsByDate])

  return (
    <div className={PAGE_SCROLL_CLASS}>
      <div className="mx-auto w-full max-w-2xl px-2 pb-6 pt-2 sm:px-4">
        {rows.length === 0 ? (
          <EmptyState icon={<CalendarIcon strokeWidth={1} />} title={t('calendarHub.scheduleEmpty')} />
        ) : (
          rows.map(({ key, day, events, tasks: dayTasks }, i) => {
            const today = isAppToday(day)
            // 月が変わるところに月の見出し（Google カレンダーと同じ）
            const newMonth = i === 0 || rows[i - 1]!.day.getMonth() !== day.getMonth()
            return (
              <section key={key}>
                {newMonth && (
                  <h3 className="px-2 pb-1 pt-4 text-sm font-semibold text-zinc-800 dark:text-zinc-100">{df.yearMonth(day)}</h3>
                )}
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
                    <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-lg font-semibold ${dayMarkerClass({ today, selected: false })}`}>
                      {format(day, 'd')}
                    </span>
                  </button>
                  <div className="min-w-0 flex-1 space-y-1">
                    {events.map((event) => (
                      // 月・週と同じく、押すと小さなカード、右クリックでメニュー
                      <button
                        key={event.id}
                        type="button"
                        onClick={(e) => setGoogleCard({ eventId: event.id, anchor: rectOf(e.currentTarget)! })}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          openTaskMenu({ kind: 'google', x: e.clientX, y: e.clientY, eventId: event.id })
                        }}
                        className="gc-plan block w-full rounded-lg px-3 py-2 text-left"
                        style={colorVars(event.color ?? DEFAULT_GOOGLE_EVENT_HEX)}
                      >
                        <div className="truncate text-sm font-medium">{event.summary}</div>
                        <div className="mt-0.5 text-xs opacity-70">
                          {event.startTime && event.endTime ? `${event.startTime} – ${event.endTime}` : t('weekCalendar.allDay')}
                        </div>
                      </button>
                    ))}
                    {dayTasks.map((task) => (
                      <TaskItem key={task.id} task={task} dayKey={key} hideDueDatePicker onRowClick={() => openTaskDetail(task.id)} />
                    ))}
                  </div>
                </div>
              </section>
            )
          })
        )}
        <div className="flex justify-center pt-3">
          <button
            type="button"
            onClick={() => setPages((p) => p + 1)}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            {t('calendarHub.scheduleMore')}
          </button>
        </div>
      </div>
      <Suspense fallback={null}>{googleCard && <GoogleEventPopover eventId={googleCard.eventId} anchor={googleCard.anchor} onClose={() => setGoogleCard(null)} />}</Suspense>
    </div>
  )
}
