import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { addDays, format, isToday, parseISO } from 'date-fns'
import { enUS, ja } from 'date-fns/locale'
import { useTaskStore, INBOX_LIST_ID } from '../store/taskStore'
import { isHabitScheduledOnDate } from '../lib/habitSchedule'
import { parseQuickAddTitle } from '../lib/parseQuickAdd'
import { getDayPlan } from '../lib/dayPlan'
import { requestPermission } from '../lib/notifications'
import { TASK_DND_TYPE } from '../lib/useTimelineDrop'
import { useTaskDetailModal } from '../hooks/useTaskDetailModal'
import { useNowMinuteTick } from '../hooks/useNowMinuteTick'
import { TaskDetail } from './TaskDetail'
import { WeekCalendarView } from './WeekCalendarView'
import type { Task } from '../types/task'

const dayKeyOf = (d: Date) => format(d, 'yyyy-MM-dd')
const dateOfKey = (key: string) => parseISO(`${key}T12:00:00`)
/** 「1 日を締める」を出し始める時刻（朝から締めの話をしない） */
const WRAP_UP_FROM_HOUR = 17

/**
 * 1 日単位の計画画面。左で「今日やること」を決め、右のタイムラインに置いて時間を確保する。
 * 情報は必要なときだけ出す: 候補（やり残し・締切間近）は畳んだ 1 行、締めは夕方か全部終わったとき。
 */
export function TodayPlannerView() {
  const { t, i18n } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const habits = useTaskStore((s) => s.habits)
  const activeTimer = useTaskStore((s) => s.activeTimer)
  const addTask = useTaskStore((s) => s.addTask)
  const updateTask = useTaskStore((s) => s.updateTask)
  const toggleTask = useTaskStore((s) => s.toggleTask)
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
  const [draftFocused, setDraftFocused] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [showDone, setShowDone] = useState(false)
  /** スマホ幅では左右に並べられないので「やること / タイムライン」を切り替える */
  const [mobilePane, setMobilePane] = useState<'list' | 'timeline'>('list')

  const date = dateOfKey(dateKey)
  const viewingToday = isToday(date)
  const dateLocale = i18n.resolvedLanguage?.startsWith('ja') ? ja : enUS
  const tomorrowKey = dayKeyOf(addDays(date, 1))

  const { carryOver, dueSoon, open, done, plannedMinutes, loggedMinutes } = useMemo(
    () => getDayPlan(tasks, dateKey),
    [tasks, dateKey],
  )
  // やり残しは今日を見ているときだけ候補に出す（過去日・未来日に持ち越しは無い）
  const suggestions = useMemo(
    () => [...(viewingToday ? carryOver : []), ...dueSoon],
    [viewingToday, carryOver, dueSoon],
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
  const shortDate = (key: string) => format(dateOfKey(key), t('planner.shortDateFormat'), { locale: dateLocale })

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
  const overCapacity = dateKey >= dayKeyOf(new Date()) && plannedMinutes > dailyCapacityMinutes
  const showWrapUp =
    viewingToday && totalCount > 0 && (open.length === 0 || now.getHours() >= WRAP_UP_FROM_HOUR)
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

  /** 行の右端: 時刻があれば時刻、無ければ締切（今日なら「今日まで」、過ぎていれば赤） */
  const rowMeta = (task: Task): { text: string; tone: 'muted' | 'warn' } | null => {
    if (task.startTime && task.endTime && task.scheduledDate === dateKey) {
      return { text: `${task.startTime}–${task.endTime}`, tone: 'muted' }
    }
    if (!task.dueDate) return null
    if (task.dueDate === dateKey) return { text: t('planner.dueToday'), tone: 'warn' }
    return { text: t('planner.dueOn', { date: shortDate(task.dueDate) }), tone: task.dueDate < dateKey ? 'warn' : 'muted' }
  }

  const renderRow = (task: Task, action?: React.ReactNode) => {
    const meta = rowMeta(task)
    return (
      <li
        key={task.id}
        draggable={!task.completed}
        onDragStart={(e) => {
          e.dataTransfer.setData(TASK_DND_TYPE, task.id)
          e.dataTransfer.setData('text/plain', task.id)
          e.dataTransfer.effectAllowed = 'move'
        }}
        className="group/row flex min-h-11 items-center gap-3 rounded-lg px-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
      >
        <button
          type="button"
          onClick={() => toggleTask(task.id)}
          aria-label={task.completed ? t('taskItem.markIncomplete') : t('taskItem.markComplete')}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors touch-manipulation ${
            task.completed
              ? 'border-accent-500 bg-accent-500 text-white'
              : 'border-zinc-300 hover:border-accent-500 dark:border-zinc-600'
          }`}
        >
          {task.completed && (
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          )}
        </button>
        <button
          type="button"
          onClick={() => openDetail(task.id)}
          className={`min-w-0 flex-1 truncate py-2.5 text-left text-[15px] ${
            task.completed ? 'text-zinc-400 line-through dark:text-zinc-500' : 'text-zinc-800 dark:text-zinc-100'
          }`}
        >
          {task.title}
        </button>
        {meta && !task.completed && (
          <span
            className={`shrink-0 text-xs tabular-nums ${
              meta.tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-400 dark:text-zinc-500'
            }`}
          >
            {meta.text}
          </span>
        )}
        {action}
      </li>
    )
  }

  const timerButton = (task: Task) => (
    <button
      type="button"
      disabled={timerBusy}
      onClick={() => startTimer(task.title, task.tags, task.id)}
      title={timerBusy ? t('planner.timerBusy') : t('planner.startTimer')}
      aria-label={t('planner.startTimer')}
      className="-mr-1 shrink-0 rounded-full p-1.5 text-zinc-300 transition-opacity touch-manipulation hover:text-accent-600
                 md:opacity-0 md:focus-visible:opacity-100 md:group-hover/row:opacity-100 disabled:cursor-not-allowed disabled:opacity-0
                 dark:text-zinc-600 dark:hover:text-accent-300"
    >
      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M7 5.5v13a1 1 0 001.52.85l10.4-6.5a1 1 0 000-1.7L8.52 4.65A1 1 0 007 5.5z" />
      </svg>
    </button>
  )

  const textButton =
    'rounded-md px-1.5 py-0.5 text-xs font-medium text-accent-600 transition-colors hover:bg-accent-50 dark:text-accent-400 dark:hover:bg-accent-500/10'
  const sectionLabel = 'px-3 pb-1 text-xs font-medium text-zinc-400 dark:text-zinc-500'

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden md:flex-row">
      <div
        role="tablist"
        aria-label={t('planner.paneTabsAria')}
        className="flex shrink-0 gap-1 px-4 pb-2 pt-[calc(0.75rem+env(safe-area-inset-top))] md:hidden"
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
                ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                : 'text-zinc-400 dark:text-zinc-500'
            }`}
          >
            {pane === 'list' ? t('planner.paneList') : t('planner.paneTimeline')}
          </button>
        ))}
      </div>

      <section
        className={`${mobilePane === 'list' ? 'flex' : 'hidden'} min-h-0 w-full flex-1 flex-col overflow-y-auto border-zinc-100 dark:border-zinc-800
                    md:flex md:w-[380px] md:flex-none md:shrink-0 md:border-r`}
      >
        <header className="px-6 pb-5 pt-4 md:pt-8">
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              {viewingToday ? t('planner.todayTitle') : format(date, t('planner.titleFormat'), { locale: dateLocale })}
            </h1>
            <div className="-mr-2 flex items-center">
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
              {!viewingToday && (
                <button
                  type="button"
                  onClick={() => setDateKey(dayKeyOf(new Date()))}
                  className="rounded-md px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  {t('common.today')}
                </button>
              )}
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
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400 [&>span]:whitespace-nowrap">
            {viewingToday && <span>{format(date, t('planner.titleFormat'), { locale: dateLocale })}</span>}
            {totalCount > 0 && (
              <>
                {viewingToday && <i className="mx-1.5 not-italic text-zinc-300 dark:text-zinc-600">·</i>}
                <span>{t('planner.summaryDone', { done: done.length, total: totalCount })}</span>
                {plannedMinutes > 0 && (
                  <>
                    <i className="mx-1.5 not-italic text-zinc-300 dark:text-zinc-600">·</i>
                    <span
                      className={overCapacity ? 'text-amber-600 dark:text-amber-400' : undefined}
                      title={overCapacity ? t('planner.overCapacity', { capacity: formatMinutes(dailyCapacityMinutes) }) : undefined}
                    >
                      {t('planner.summaryPlanned', { time: formatMinutes(plannedMinutes) })}
                      {overCapacity && ` ${t('planner.overCapacityShort')}`}
                    </span>
                  </>
                )}
                {loggedMinutes > 0 && (
                  <>
                    <i className="mx-1.5 not-italic text-zinc-300 dark:text-zinc-600">·</i>
                    <span>{t('planner.summaryLogged', { time: formatMinutes(loggedMinutes) })}</span>
                  </>
                )}
              </>
            )}
          </p>
        </header>

        <div className="px-3">
          <div className="flex items-center gap-3 rounded-lg px-3 focus-within:bg-zinc-50 dark:focus-within:bg-zinc-800/60">
            <svg className="h-5 w-5 shrink-0 text-zinc-300 dark:text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <input
              data-quickadd
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onFocus={() => setDraftFocused(true)}
              onBlur={() => setDraftFocused(false)}
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
              placeholder={t('planner.addPlaceholder')}
              aria-describedby="planner-add-hint"
              className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
          </div>
          <p
            id="planner-add-hint"
            className={`px-11 text-xs text-zinc-400 transition-opacity dark:text-zinc-500 ${draftFocused ? 'opacity-100' : 'sr-only'}`}
          >
            {t('planner.addHint')}
          </p>
        </div>

        <ul className="mt-2 px-3">
          {open.map((task) => renderRow(task, timerButton(task)))}
        </ul>

        {totalCount === 0 && (
          <div className="px-6 pt-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-300">{t('planner.emptyTitle')}</p>
            <p className="mt-1 text-sm leading-relaxed text-zinc-400 dark:text-zinc-500">{t('planner.emptyBody')}</p>
          </div>
        )}
        {totalCount > 0 && open.length === 0 && (
          <p className="px-6 pt-2 text-sm text-zinc-500 dark:text-zinc-400">{t('planner.allDone')}</p>
        )}

        {suggestions.length > 0 && (
          <div className="mt-6 px-3">
            <button
              type="button"
              onClick={() => setShowSuggestions((v) => !v)}
              aria-expanded={showSuggestions}
              className="flex w-full items-center gap-1.5 rounded-lg px-3 py-1.5 text-left text-sm text-zinc-600 transition-colors hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
            >
              <svg className={`h-3 w-3 shrink-0 text-zinc-400 transition-transform ${showSuggestions ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
              <span className="flex-1">{t('planner.suggestionsHeading', { count: suggestions.length })}</span>
            </button>
            {showSuggestions && (
              <>
                <ul>
                  {suggestions.map((task) => (
                    renderRow(
                      task,
                      <button type="button" onClick={() => rescheduleTasks([task.id], dateKey)} className={`shrink-0 ${textButton}`}>
                        {viewingToday ? t('planner.doToday') : t('planner.doThisDay')}
                      </button>,
                    )
                  ))}
                </ul>
                {suggestions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => rescheduleTasks(suggestions.map((x) => x.id), dateKey)}
                    className={`ml-11 mt-1 ${textButton}`}
                  >
                    {t('planner.addAllSuggestions')}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {dayHabits.length > 0 && (
          <div className="mt-6 px-3">
            <h2 className={sectionLabel}>{t('planner.habitsHeading')}</h2>
            <div className="flex flex-wrap gap-2 px-3">
              {dayHabits.map((h) => {
                const checked = h.completedDates.includes(dateKey)
                return (
                  <button
                    key={h.id}
                    type="button"
                    aria-pressed={checked}
                    onClick={() => toggleHabitDate(h.id, dateKey)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors touch-manipulation ${
                      checked
                        ? 'bg-zinc-100 text-zinc-400 line-through dark:bg-zinc-800 dark:text-zinc-500'
                        : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700'
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: h.color, opacity: checked ? 0.4 : 1 }} />
                    {h.title}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {done.length > 0 && (
          <div className="mt-6 px-3">
            <button
              type="button"
              onClick={() => setShowDone((v) => !v)}
              aria-expanded={showDone}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
            >
              <svg className={`h-3 w-3 transition-transform ${showDone ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
              {t('planner.doneHeading', { count: done.length })}
            </button>
            {showDone && (
              <ul>
                {done.map((task) => renderRow(task))}
              </ul>
            )}
          </div>
        )}

        <footer className="mt-auto space-y-2 px-6 pb-6 pt-8 text-sm">
          {showWrapUp && (
            <p className="text-zinc-500 dark:text-zinc-400">
              {open.length > 0 ? t('planner.wrapUpRemaining', { count: open.length }) : t('planner.wrapUpClear')}{' '}
              {open.length > 0 && (
                <button type="button" onClick={() => rescheduleTasks(open.map((x) => x.id), tomorrowKey)} className={textButton}>
                  {t('planner.moveRestToTomorrow')}
                </button>
              )}
              <button type="button" onClick={() => selectView('plan-vs-actual')} className={textButton}>
                {t('planner.reviewPlanVsLog')}
              </button>
              {[5, 6, 0].includes(date.getDay()) && (
                <button type="button" onClick={() => selectView('stats')} className={textButton}>
                  {t('planner.reviewWeek')}
                </button>
              )}
            </p>
          )}
          {showReminderPrompt && (
            <p className="text-zinc-400 dark:text-zinc-500">
              {t('planner.reminderPromptShort')}{' '}
              <button type="button" onClick={() => void enableReminders()} className={`whitespace-nowrap ${textButton}`}>
                {t('planner.reminderPromptEnable')}
              </button>
              <button
                type="button"
                onClick={dismissReminderPrompt}
                className="whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                {t('planner.reminderPromptLater')}
              </button>
            </p>
          )}
        </footer>
      </section>

      <section className={`${mobilePane === 'timeline' ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-1 flex-col md:flex`}>
        <WeekCalendarView key={dateKey} anchor={date} selectedDateKey={dateKey} singleDay />
      </section>

      {detailTask && <TaskDetail task={detailTask} onClose={closeDetail} />}
    </div>
  )
}
