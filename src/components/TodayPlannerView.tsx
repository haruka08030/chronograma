import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { addDays, format, isToday, parseISO } from 'date-fns'
import { enUS, ja } from 'date-fns/locale'
import { useTaskStore, INBOX_LIST_ID } from '../store/taskStore'
import { isHabitScheduledOnDate } from '../lib/habitSchedule'
import { parseQuickAddTitle } from '../lib/parseQuickAdd'
import { getDayPlan } from '../lib/dayPlan'
import { requestPermission } from '../lib/notifications'
import { useTaskDetailModal } from '../hooks/useTaskDetailModal'
import { useNowMinuteTick } from '../hooks/useNowMinuteTick'
import { TaskItem } from './TaskItem'
import { TaskDetail } from './TaskDetail'
import { WeekCalendarView } from './WeekCalendarView'
import type { Task } from '../types/task'

const dayKeyOf = (d: Date) => format(d, 'yyyy-MM-dd')
const dateOfKey = (key: string) => parseISO(`${key}T12:00:00`)

/**
 * 1 日単位の計画画面。左で「今日やること」を決め（持ち越し・追加・習慣）、
 * 右のタイムラインにドラッグして時間を確保し、終わりに 1 日を締める。
 */
export function TodayPlannerView() {
  const { t, i18n } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const habits = useTaskStore((s) => s.habits)
  const activeTimer = useTaskStore((s) => s.activeTimer)
  const addTask = useTaskStore((s) => s.addTask)
  const updateTask = useTaskStore((s) => s.updateTask)
  const rescheduleTasks = useTaskStore((s) => s.rescheduleTasks)
  const toggleHabitDate = useTaskStore((s) => s.toggleHabitDate)
  const startTimer = useTaskStore((s) => s.startTimer)
  const selectView = useTaskStore((s) => s.selectView)
  const dailyReminders = useTaskStore((s) => s.dailyReminders)
  const reminderPromptDismissed = useTaskStore((s) => s.reminderPromptDismissed)
  const setDailyReminders = useTaskStore((s) => s.setDailyReminders)
  const dismissReminderPrompt = useTaskStore((s) => s.dismissReminderPrompt)
  const dailyCapacityMinutes = useTaskStore((s) => s.dailyCapacityMinutes)
  const now = useNowMinuteTick()
  const { detailTask, openDetail, closeDetail } = useTaskDetailModal(tasks)

  const [dateKey, setDateKey] = useState(() => dayKeyOf(new Date()))
  const [draft, setDraft] = useState('')
  const [showDone, setShowDone] = useState(false)
  /** スマホ幅では左右に並べられないので「やること / タイムライン」を切り替える */
  const [mobilePane, setMobilePane] = useState<'list' | 'timeline'>('list')

  const date = dateOfKey(dateKey)
  const viewingToday = isToday(date)
  const dateLocale = i18n.resolvedLanguage?.startsWith('ja') ? ja : enUS
  const tomorrowKey = dayKeyOf(addDays(date, 1))

  const { carryOver, open, done, plannedMinutes, loggedMinutes } = useMemo(
    () => getDayPlan(tasks, dateKey),
    [tasks, dateKey],
  )

  const dayHabits = useMemo(
    () => habits.filter((h) => isHabitScheduledOnDate(h, date)),
    // date は dateKey から毎回作り直すので key で依存を取る
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [habits, dateKey],
  )

  const formatMinutes = (m: number) => {
    const h = Math.floor(m / 60)
    const min = m % 60
    if (h === 0) return t('planner.minutes', { m: min })
    if (min === 0) return t('planner.hours', { h })
    return t('planner.hoursMinutes', { h, m: min })
  }

  const greeting = (() => {
    const h = now.getHours()
    if (h < 11) return t('planner.greetingMorning')
    if (h < 18) return t('planner.greetingAfternoon')
    return t('planner.greetingEvening')
  })()

  const submitDraft = () => {
    const trimmed = draft.trim()
    if (!trimmed) return
    const parsed = parseQuickAddTitle(trimmed, Boolean(i18n.resolvedLanguage?.startsWith('ja')))
    const id = addTask(parsed.title, INBOX_LIST_ID)
    if (id) {
      // この画面で足したものは「やる日」。日付を書けばその日、時刻を書けばタイムラインに置く
      updateTask(id, {
        scheduledDate: parsed.dueDate ?? dateKey,
        ...(parsed.startTime ? { startTime: parsed.startTime, endTime: parsed.endTime } : {}),
        ...(parsed.tags.length ? { tags: parsed.tags } : {}),
      })
    }
    setDraft('')
  }

  const totalCount = open.length + done.length
  const overCapacity = viewingToday || dateKey > dayKeyOf(new Date()) ? plannedMinutes > dailyCapacityMinutes : false
  const showReminderPrompt =
    totalCount > 0 &&
    !reminderPromptDismissed &&
    !dailyReminders.planTime &&
    !dailyReminders.wrapUpTime &&
    typeof window !== 'undefined' &&
    'Notification' in window &&
    Notification.permission !== 'denied'

  const enableReminders = async () => {
    const granted = await requestPermission()
    if (granted) setDailyReminders({ planTime: '08:30', wrapUpTime: '18:00' })
    dismissReminderPrompt()
  }
  const timerBusy = activeTimer !== null

  const renderTaskRow = (task: Task, trailing?: React.ReactNode) => (
    <div key={task.id} className="group/row flex items-center gap-1">
      <div className="min-w-0 flex-1">
        <TaskItem task={task} hideDueDatePicker onRowClick={() => openDetail(task.id)} />
      </div>
      {trailing}
    </div>
  )

  const timerButton = (task: Task) => (
    <button
      type="button"
      disabled={timerBusy}
      onClick={() => startTimer(task.title, task.tags, task.id)}
      title={timerBusy ? t('planner.timerBusy') : t('planner.startTimer')}
      aria-label={t('planner.startTimer')}
      className="shrink-0 rounded-full p-2 text-zinc-400 transition-opacity touch-manipulation hover:bg-accent-50 hover:text-accent-600
                 md:p-1.5 md:opacity-0 md:focus-visible:opacity-100 md:group-hover/row:opacity-100 disabled:cursor-not-allowed disabled:opacity-30 md:disabled:opacity-0
                 dark:hover:bg-accent-500/10 dark:hover:text-accent-300"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
      </svg>
    </button>
  )

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden md:flex-row">
      <div
        role="tablist"
        aria-label={t('planner.paneTabsAria')}
        className="flex shrink-0 gap-1 border-b border-zinc-200 px-4 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] dark:border-zinc-800 md:hidden"
      >
        {(['list', 'timeline'] as const).map((pane) => (
          <button
            key={pane}
            type="button"
            role="tab"
            aria-selected={mobilePane === pane}
            onClick={() => setMobilePane(pane)}
            className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors touch-manipulation ${
              mobilePane === pane
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
            }`}
          >
            {pane === 'list' ? t('planner.paneList') : t('planner.paneTimeline')}
          </button>
        ))}
      </div>
      <section
        className={`${mobilePane === 'list' ? 'flex' : 'hidden'} min-h-0 w-full flex-1 flex-col overflow-y-auto border-zinc-200 dark:border-zinc-800
                    md:flex md:w-[400px] md:flex-none md:shrink-0 md:border-r`}
      >
        <header className="px-6 pb-4 pt-6">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-accent-600 dark:text-accent-400">
              {viewingToday ? greeting : t('planner.planningFor')}
            </p>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setDateKey(dayKeyOf(addDays(date, -1)))}
                aria-label={t('planner.prevDay')}
                className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setDateKey(dayKeyOf(new Date()))}
                disabled={viewingToday}
                className="rounded-md px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-100 disabled:opacity-40 disabled:hover:bg-transparent dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                {t('common.today')}
              </button>
              <button
                type="button"
                onClick={() => setDateKey(tomorrowKey)}
                aria-label={t('planner.nextDay')}
                className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            </div>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            {format(date, t('planner.titleFormat'), { locale: dateLocale })}
          </h1>
          <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
            <div className="flex gap-1">
              <dt>{t('planner.statDone')}</dt>
              <dd className="font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">
                {done.length}/{totalCount}
              </dd>
            </div>
            <div className="flex gap-1">
              <dt>{t('planner.statPlanned')}</dt>
              <dd className="font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">{formatMinutes(plannedMinutes)}</dd>
            </div>
            <div className="flex gap-1">
              <dt>{t('planner.statLogged')}</dt>
              <dd className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{formatMinutes(loggedMinutes)}</dd>
            </div>
          </dl>
          {overCapacity && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              {t('planner.overCapacity', { capacity: formatMinutes(dailyCapacityMinutes) })}
            </p>
          )}
        </header>

        <div className="px-4">
          <input
            data-quickadd
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === 'NumpadEnter') && !e.nativeEvent.isComposing) {
                e.preventDefault()
                submitDraft()
              }
              if (e.key === 'Escape') {
                setDraft('')
                e.currentTarget.blur()
              }
            }}
            placeholder={viewingToday ? t('planner.addPlaceholderToday') : t('planner.addPlaceholder')}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition-colors
                       placeholder:text-zinc-400 focus:border-accent-400 focus:ring-2 focus:ring-accent-400/20
                       dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />
        </div>

        {viewingToday && carryOver.length > 0 && (
          <div className="mx-4 mt-4 rounded-xl border border-amber-200/70 bg-amber-50/60 px-2 py-2 dark:border-amber-500/20 dark:bg-amber-500/5">
            <div className="flex items-center justify-between gap-2 px-2 pb-1">
              <div className="min-w-0">
                <h2 className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                  {t('planner.carryOverHeading', { count: carryOver.length })}
                </h2>
                <p className="text-[11px] text-amber-700/80 dark:text-amber-300/70">{t('planner.carryOverHint')}</p>
              </div>
              <button
                type="button"
                onClick={() => rescheduleTasks(carryOver.map((x) => x.id), dateKey)}
                className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-amber-800 shadow-sm ring-1 ring-amber-200 transition-colors hover:bg-amber-100
                           dark:bg-zinc-900 dark:text-amber-300 dark:ring-amber-500/30 dark:hover:bg-amber-500/10"
              >
                {t('planner.carryOverAll')}
              </button>
            </div>
            {carryOver.map((task) =>
              renderTaskRow(
                task,
                <button
                  type="button"
                  onClick={() => rescheduleTasks([task.id], dateKey)}
                  className="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-500/10"
                >
                  {t('planner.doToday')}
                </button>,
              ),
            )}
          </div>
        )}

        <div className="mt-4 px-2">
          <h2 className="px-4 pb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
            {t('planner.tasksHeading')}
          </h2>
          {open.length === 0 && done.length === 0 ? (
            <div className="mx-2 rounded-xl border border-dashed border-zinc-200 px-4 py-5 text-center dark:border-zinc-700">
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t('planner.emptyTitle')}</p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">{t('planner.emptyBody')}</p>
            </div>
          ) : open.length === 0 ? (
            <p className="px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">{t('planner.allDone')}</p>
          ) : (
            open.map((task) => renderTaskRow(task, timerButton(task)))
          )}
          {open.length > 0 && (
            <p className="hidden px-4 pt-1 text-[11px] text-zinc-400 dark:text-zinc-500 md:block">{t('planner.dragHint')}</p>
          )}
        </div>

        {dayHabits.length > 0 && (
          <div className="mt-5 px-6">
            <h2 className="pb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
              {t('planner.habitsHeading')}
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {dayHabits.map((h) => {
                const checked = h.completedDates.includes(dateKey)
                return (
                  <button
                    key={h.id}
                    type="button"
                    aria-pressed={checked}
                    onClick={() => toggleHabitDate(h.id, dateKey)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      checked
                        ? 'border-transparent text-white'
                        : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
                    }`}
                    style={checked ? { backgroundColor: h.color } : undefined}
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${checked ? 'bg-white/80' : ''}`}
                      style={checked ? undefined : { backgroundColor: h.color }}
                    />
                    {h.title}
                    {h.timeMode !== 'none' && h.startTime && (
                      <span className={checked ? 'text-white/80' : 'text-zinc-400'}>{h.startTime}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {done.length > 0 && (
          <div className="mt-4 px-2">
            <button
              type="button"
              onClick={() => setShowDone((v) => !v)}
              aria-expanded={showDone}
              className="flex w-full items-center gap-1 px-4 py-1 text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
            >
              <svg className={`h-3 w-3 transition-transform ${showDone ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
              {t('planner.doneHeading', { count: done.length })}
            </button>
            {showDone && done.map((task) => renderTaskRow(task))}
          </div>
        )}

        <div className="mt-auto px-4 pb-5 pt-6">
          {showReminderPrompt && (
            <div className="mb-3 rounded-xl border border-accent-200 bg-accent-50/60 px-4 py-3 dark:border-accent-500/30 dark:bg-accent-500/10">
              <p className="text-xs font-semibold text-accent-800 dark:text-accent-200">{t('planner.reminderPromptTitle')}</p>
              <p className="mt-0.5 text-xs text-accent-700/80 dark:text-accent-200/70">{t('planner.reminderPromptBody')}</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => void enableReminders()}
                  className="rounded-lg bg-accent-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-accent-700"
                >
                  {t('planner.reminderPromptEnable')}
                </button>
                <button
                  type="button"
                  onClick={dismissReminderPrompt}
                  className="rounded-lg px-2.5 py-1 text-xs text-accent-700 transition-colors hover:bg-accent-100 dark:text-accent-300 dark:hover:bg-accent-500/10"
                >
                  {t('planner.reminderPromptLater')}
                </button>
              </div>
            </div>
          )}
          <div className="rounded-xl bg-zinc-50 px-4 py-3 dark:bg-zinc-800/50">
            <h2 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{t('planner.wrapUpHeading')}</h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              {open.length > 0
                ? t('planner.wrapUpRemaining', { count: open.length })
                : totalCount > 0
                  ? t('planner.wrapUpClear')
                  : t('planner.wrapUpEmpty')}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {open.length > 0 && (
                <button
                  type="button"
                  onClick={() => rescheduleTasks(open.map((x) => x.id), tomorrowKey)}
                  className="rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 shadow-sm ring-1 ring-zinc-200 transition-colors hover:bg-zinc-100
                             dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-700 dark:hover:bg-zinc-800"
                >
                  {t('planner.moveRestToTomorrow')}
                </button>
              )}
              {[5, 6, 0].includes(date.getDay()) && (
                <button
                  type="button"
                  onClick={() => selectView('stats')}
                  className="rounded-lg px-2.5 py-1 text-xs font-medium text-accent-600 transition-colors hover:bg-accent-50 dark:text-accent-400 dark:hover:bg-accent-500/10"
                >
                  {t('planner.reviewWeek')}
                </button>
              )}
              <button
                type="button"
                onClick={() => selectView('plan-vs-actual')}
                className="rounded-lg px-2.5 py-1 text-xs font-medium text-accent-600 transition-colors hover:bg-accent-50 dark:text-accent-400 dark:hover:bg-accent-500/10"
              >
                {t('planner.reviewPlanVsLog')}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className={`${mobilePane === 'timeline' ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-1 flex-col md:flex`}>
        <p className="hidden shrink-0 md:block border-b border-zinc-200 px-6 py-2 text-[11px] text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
          {t('planner.timelineHint')}
        </p>
        <WeekCalendarView key={dateKey} anchor={date} selectedDateKey={dateKey} singleDay />
      </section>

      {detailTask && <TaskDetail task={detailTask} onClose={closeDetail} />}
    </div>
  )
}
