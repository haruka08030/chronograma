import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { addDays, format, parseISO } from 'date-fns'
import { enUS, ja } from 'date-fns/locale'
import { useTaskStore, INBOX_LIST_ID } from '../store/taskStore'
import { isHabitScheduledOnDate } from '../lib/habitSchedule'
import { addTaskFromQuickText } from '../lib/quickAddTask'
import { getDayPlan, getMoreSuggestions } from '../lib/dayPlan'
import { PRIORITY_RING_CLASS } from '../lib/priorityColor'
import { isActiveTask } from '../lib/taskLifecycle'
import { minutesOfLogOnCalendarDay } from '../lib/taskTimeRange'
import { useNavShortcut } from '../lib/shortcuts'
import { unplannedListIds } from '../lib/listKind'
import { requestPermission } from '../lib/notifications'
import { TASK_DND_TYPE } from '../lib/useTimelineDrop'
import { startTimerForTask } from '../lib/timerDrop'
import { startNativeTaskDragGhost } from '../lib/nativeTaskDragGhost'
import { useTaskDetailModal } from '../hooks/useTaskDetailModal'
import { useNowMinuteTick } from '../hooks/useNowMinuteTick'
import { TaskDetail } from './TaskDetail'
import { WeekCalendarView } from './WeekCalendarView'
import { RecordPanel } from './RecordPanel'
import { SleepRow } from './SleepRow'
import type { Task } from '../types/task'
import { buildHabitRecordIndex, habitDayStatus, habitRecordFor, isTimedHabit } from '../lib/habitTiming'
import { colorVars } from '../lib/logCategoryColors'
import { isSleepRecord } from '../lib/sleep'
import { isAppToday, zonedNow } from '../lib/timeZone'
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, PlayIcon, PlusIcon } from './icons'
import { buttonClass } from './ui/buttonClass'
import { Segmented } from './ui/Segmented'
import { isSubmitEnter } from '../lib/keyboard'

const dayKeyOf = (d: Date) => format(d, 'yyyy-MM-dd')
const dateOfKey = (key: string) => parseISO(`${key}T12:00:00`)
const META_TONE_CLASS = {
  muted: 'text-zinc-400 dark:text-zinc-500',
  overdue: 'text-red-500 dark:text-red-400 font-medium',
  today: 'text-amber-600 dark:text-amber-400 font-medium',
  tomorrow: 'text-amber-500/90 dark:text-amber-300/80',
} as const

/** 「1 日を締める」を出し始める時刻（朝から締めの話をしない） */
const WRAP_UP_FROM_HOUR = 17

/**
 * 1 日単位の計画画面。左で「今日やること」を決め、右のタイムラインに置いて時間を確保する。
 * 情報は必要なときだけ出す: 候補（やり残し・締切間近）は畳んだ 1 行、締めは夕方か全部終わったとき。
 */
const MORE_SUGGESTIONS_PAGE = 10

export function TodayPlannerView() {
  const { t, i18n } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const habits = useTaskStore((s) => s.habits)
  const activeTimer = useTaskStore((s) => s.activeTimer)
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const rescheduleTasks = useTaskStore((s) => s.rescheduleTasks)
  const toggleHabitDate = useTaskStore((s) => s.toggleHabitDate)
  const startTimer = useTaskStore((s) => s.startTimer)
  const selectView = useTaskStore((s) => s.selectView)
  const setCalendarMode = useTaskStore((s) => s.setCalendarMode)
  const reminderPromptDismissed = useTaskStore((s) => s.reminderPromptDismissed)
  const enableRecommendedNotifications = useTaskStore((s) => s.enableRecommendedNotifications)
  const anyNotification = useTaskStore((s) => Boolean(s.dailyReminders.planTime) || s.eventReminderMinutes != null || s.notificationsEnabled)
  const dismissReminderPrompt = useTaskStore((s) => s.dismissReminderPrompt)
  const dailyCapacityMinutes = useTaskStore((s) => s.dailyCapacityMinutes)
  const now = useNowMinuteTick()
  const { detailTask, openDetail, closeDetail } = useTaskDetailModal(tasks)

  const [dateKey, setDateKey] = useState(() => dayKeyOf(zonedNow()))
  useNavShortcut({
    today: () => setDateKey(dayKeyOf(zonedNow())),
    prev: () => setDateKey((k) => dayKeyOf(addDays(dateOfKey(k), -1))),
    next: () => setDateKey((k) => dayKeyOf(addDays(dateOfKey(k), 1))),
  })
  const [draft, setDraft] = useState('')
  const [draftFocused, setDraftFocused] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [showDone, setShowDone] = useState(false)
  /** スマホ幅では左右に並べられないので「やること / タイムライン」を切り替える */
  const [mobilePane, setMobilePane] = useState<'list' | 'timeline'>('list')

  const date = dateOfKey(dateKey)
  const viewingToday = isAppToday(date)
  const dateLocale = i18n.resolvedLanguage?.startsWith('ja') ? ja : enUS
  const tomorrowKey = dayKeyOf(addDays(date, 1))

  const lists = useTaskStore((s) => s.lists)
  const excludedListIds = useMemo(() => unplannedListIds(lists), [lists])
  /** 推定でも分類が決まらなかった今日の記録（1 日を締めるときにまとめて付ける） */
  const untaggedLogs = useMemo(
    () =>
      tasks
        .filter((x) => x.isTimeLog && isActiveTask(x) && !isSleepRecord(x) && x.tags.length === 0 && minutesOfLogOnCalendarDay(x, dateKey) > 0)
        .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? '')),
    [tasks, dateKey],
  )
  const { overdue: overdueAll, carryOver, dueSoon, open, done, plannedMinutes, loggedMinutes } = useMemo(
    () => getDayPlan(tasks, dateKey, excludedListIds),
    [tasks, dateKey, excludedListIds],
  )
  // 締切は焦らせてよい: 期限切れは畳まず、今日のリストの先頭に赤い日付つきで出す（今日を見ているときだけ）
  const overdue = viewingToday ? overdueAll : []
  // やり残しは今日を見ているときだけ候補に出す（過去日・未来日に持ち越しは無い）
  const suggestions = useMemo(
    () => [...(viewingToday ? carryOver : []), ...dueSoon],
    [viewingToday, carryOver, dueSoon],
  )
  // その下に、締切が先のもの・日付なしなどを 10 件ずつスクロールで足していく
  const moreSuggestions = useMemo(
    () => getMoreSuggestions(tasks, dateKey, excludedListIds),
    [tasks, dateKey, excludedListIds],
  )
  const [moreShown, setMoreShown] = useState(MORE_SUGGESTIONS_PAGE)
  const [moreShownFor, setMoreShownFor] = useState(dateKey)
  if (moreShownFor !== dateKey) {
    setMoreShownFor(dateKey)
    setMoreShown(MORE_SUGGESTIONS_PAGE)
  }
  const moreSentinelRef = useRef<HTMLLIElement>(null)
  const hasMoreToShow = moreShown < moreSuggestions.length
  useEffect(() => {
    const el = moreSentinelRef.current
    if (!el || !showSuggestions || !hasMoreToShow) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setMoreShown((n) => n + MORE_SUGGESTIONS_PAGE)
      },
      { rootMargin: '0px 0px 200px 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [showSuggestions, hasMoreToShow, moreShown])

  const dayHabits = useMemo(
    () => habits.filter((h) => isHabitScheduledOnDate(h, date)),
    // date は dateKey から毎回作り直すので key で依存を取る
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [habits, dateKey],
  )

  const habitRecords = useMemo(() => buildHabitRecordIndex(tasks), [tasks])

  const formatMinutes = (m: number) => {
    const h = Math.floor(m / 60)
    const min = m % 60
    if (h === 0) return t('planner.minutes', { m: min })
    if (min === 0) return t('planner.hours', { h })
    return t('planner.hoursMinutes', { h, m: min })
  }
  const shortDate = (key: string) => format(dateOfKey(key), t('planner.shortDateFormat'), { locale: dateLocale })

  const submitDraft = () => {
    if (!draft.trim()) return
    // この画面で足したものは「やる日」＝見ている日。書き方の解釈は To-Do 画面と同じ
    addTaskFromQuickText(draft, { defaultListId: INBOX_LIST_ID, defaultDate: dateKey })
    setDraft('')
  }

  const totalCount = open.length + done.length
  const overCapacity = dateKey >= dayKeyOf(zonedNow()) && plannedMinutes > dailyCapacityMinutes
  const showWrapUp =
    viewingToday && totalCount > 0 && ((open.length === 0 && overdue.length === 0) || now.getHours() >= WRAP_UP_FROM_HOUR)
  const showReminderPrompt =
    totalCount > 0 &&
    !reminderPromptDismissed &&
    !anyNotification &&
    typeof window !== 'undefined' &&
    'Notification' in window &&
    Notification.permission !== 'denied'

  const enableReminders = async () => {
    const granted = await requestPermission()
    if (granted) enableRecommendedNotifications()
    dismissReminderPrompt()
  }

  /** 行の右端: 時刻があれば時刻、無ければ締切（今日なら「今日まで」、過ぎていれば赤） */
  /** 締切は焦らせてよい: 期限切れ＝赤 / 今日まで＝オレンジ / 明日まで＝薄いオレンジ（To‑Do の行と同じ段階） */
  const rowMeta = (task: Task): { text: string; tone: 'muted' | 'overdue' | 'today' | 'tomorrow' } | null => {
    if (task.startTime && task.endTime && task.scheduledDate === dateKey) {
      return { text: `${task.startTime}–${task.endTime}`, tone: 'muted' }
    }
    if (!task.dueDate) return null
    if (task.dueDate === dateKey) return { text: t('planner.dueToday'), tone: 'today' }
    const text = t('planner.dueOn', { date: shortDate(task.dueDate) })
    if (task.dueDate < dateKey) return { text, tone: 'overdue' }
    return { text, tone: task.dueDate === tomorrowKey ? 'tomorrow' : 'muted' }
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
          startNativeTaskDragGhost(e, task.title)
        }}
        className="group/row flex min-h-11 items-center gap-3 rounded-lg px-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
      >
        <button
          type="button"
          onClick={() => toggleTask(task.id)}
          aria-label={task.completed ? t('taskItem.markIncomplete') : t('taskItem.markComplete')}
          className="group/check -m-2.5 shrink-0 p-2.5 touch-manipulation"
        >
          {/* 見た目の丸は 20px のまま、押せる範囲は周り 10px ずつ広げて 40px */}
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-full border-[1.5px] transition-colors ${
              task.completed
                ? 'border-accent-500 bg-accent-500 text-on-accent'
                : PRIORITY_RING_CLASS[task.priority]
                  ? `border-current ${PRIORITY_RING_CLASS[task.priority]}`
                  : 'border-zinc-300 group-hover/check:border-accent-500 dark:border-zinc-600'
            }`}
          >
            {task.completed && (
              <CheckIcon className="h-3 w-3" strokeWidth={3} />
            )}
          </span>
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
              META_TONE_CLASS[meta.tone]
            }`}
          >
            {meta.text}
          </span>
        )}
        {action}
      </li>
    )
  }

  // 記録中でも押せる（前の記録を保存して切り替える）。いま計っているタスクには出さない
  const timerButton = (task: Task) => activeTimer?.taskId === task.id ? null : (
    <button
      type="button"
      onClick={() => startTimerForTask(task.id)}
      title={t('planner.startTimer')}
      aria-label={t('planner.startTimer')}
      className="-mr-1 shrink-0 rounded-full p-2.5 text-zinc-400 transition-opacity touch-manipulation hover:text-accent-600 md:p-1.5
                 md:opacity-0 md:focus-visible:opacity-100 md:group-hover/row:opacity-100
                 dark:text-zinc-600 dark:hover:text-accent-300"
    >
      <PlayIcon className="h-4 w-4" />
    </button>
  )

  const textButton = buttonClass({ variant: 'link', size: 'xs' })
  const sectionLabel = 'px-3 pb-1 text-xs font-medium text-zinc-400 dark:text-zinc-500'

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden md:flex-row">
      {/* スマホだけ: やること / タイムラインの切り替え */}
      <div className="shrink-0 px-4 pb-2 pt-[calc(0.75rem+env(safe-area-inset-top))] md:hidden">
        <Segmented
          role="tab"
          size="md"
          fullWidth
          ariaLabel={t('planner.paneTabsAria')}
          value={mobilePane}
          onChange={setMobilePane}
          options={[
            { value: 'list', label: t('planner.paneList') },
            { value: 'timeline', label: t('planner.paneTimeline') },
          ]}
        />
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
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
              {!viewingToday && (
                <button
                  type="button"
                  onClick={() => setDateKey(dayKeyOf(zonedNow()))}
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
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
          {viewingToday && (
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{format(date, t('planner.titleFormat'), { locale: dateLocale })}</p>
          )}
          {/* 朝に入れる睡眠（寝た・起きた時刻）。記録の時間には数えない */}
          <div className="mt-3">
            <SleepRow key={dateKey} dateKey={dateKey} />
          </div>
          {/* 記録の合計を主役に、予定は右に小さく。完了数は下の「完了 N 件」と重なるので出さない */}
          {(loggedMinutes > 0 || plannedMinutes > 0) && (
            <div className="mt-5 flex items-baseline justify-between gap-3">
              {loggedMinutes > 0 ? (
                <span className="text-sm font-medium tabular-nums text-zinc-800 dark:text-zinc-200">
                  {t('planner.summaryLogged', { time: formatMinutes(loggedMinutes) })}
                </span>
              ) : <span />}
              {plannedMinutes > 0 && (
                <span
                  className={`whitespace-nowrap text-xs tabular-nums ${overCapacity ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-400 dark:text-zinc-500'}`}
                  title={overCapacity ? t('planner.overCapacity', { capacity: formatMinutes(dailyCapacityMinutes) }) : undefined}
                >
                  {t('planner.summaryPlanned', { time: formatMinutes(plannedMinutes) })}
                  {overCapacity && ` ${t('planner.overCapacityShort')}`}
                </span>
              )}
            </div>
          )}
          {/* 記録（タイマー・後から記録・分類ごとの時間）。スマホでは色の帯を押すとタイムラインへ */}
          <div className={loggedMinutes > 0 || plannedMinutes > 0 ? 'mt-2' : 'mt-4'}>
            <RecordPanel key={dateKey} dateKey={dateKey} viewingToday={viewingToday} />
          </div>
        </header>

        <div className="px-3">
          <h2 className={sectionLabel}>{t('planner.todoHeading')}</h2>
          <div className="flex items-center gap-3 rounded-lg px-3 focus-within:bg-zinc-50 dark:focus-within:bg-zinc-800/60">
            <PlusIcon className="h-5 w-5 shrink-0 text-zinc-300 dark:text-zinc-600" />
            <input
              data-quickadd
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onFocus={() => setDraftFocused(true)}
              onBlur={() => setDraftFocused(false)}
              onKeyDown={(e) => {
                if (isSubmitEnter(e)) {
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
          {overdue.map((task) => renderRow(task, timerButton(task)))}
          {open.map((task) => renderRow(task, timerButton(task)))}
        </ul>

        {totalCount > 0 && open.length === 0 && overdue.length === 0 && (
          <p className="px-6 pt-2 text-sm text-zinc-500 dark:text-zinc-400">{t('planner.allDone')}</p>
        )}

        {(suggestions.length > 0 || moreSuggestions.length > 0) && (
          <div className="mt-6 px-3">
            <button
              type="button"
              onClick={() => setShowSuggestions((v) => !v)}
              aria-expanded={showSuggestions}
              className="flex w-full items-center gap-1.5 rounded-lg px-3 py-1.5 text-left text-sm text-zinc-600 transition-colors hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
            >
              <ChevronRightIcon className={`h-3 w-3 shrink-0 text-zinc-400 transition-transform ${showSuggestions ? 'rotate-90' : ''}`} strokeWidth={2.5} />
              <span className="flex-1">
                {suggestions.length > 0 ? t('planner.suggestionsHeading', { count: suggestions.length }) : t('planner.suggestionsHeadingPlain')}
              </span>
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
                {moreSuggestions.length > 0 && (
                  <>
                    <p className="ml-11 mt-4 text-xs text-zinc-400 dark:text-zinc-500">{t('planner.moreSuggestionsHeading')}</p>
                    <ul>
                      {moreSuggestions.slice(0, moreShown).map((task) => (
                        renderRow(
                          task,
                          <button type="button" onClick={() => rescheduleTasks([task.id], dateKey)} className={`shrink-0 ${textButton}`}>
                            {viewingToday ? t('planner.doToday') : t('planner.doThisDay')}
                          </button>,
                        )
                      ))}
                      {hasMoreToShow && <li ref={moreSentinelRef} aria-hidden className="h-px" />}
                    </ul>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {dayHabits.length > 0 && (
          <div className="mt-6 px-3">
            <h2 className={sectionLabel}>{t('planner.habitsHeading')}</h2>
            {/* 習慣はリング: 押すと達成（もう一度押すと外す）。▶ でその名前のタイマーを始める */}
            <ul className="flex flex-wrap gap-x-2 gap-y-3 px-1 pt-1">
              {dayHabits.map((h) => {
                const status = habitDayStatus(h, dateKey, habitRecords)
                const record = status === 'offTime' ? habitRecordFor(habitRecords, h, dateKey) : null
                const canTime = viewingToday && status === 'missed' && activeTimer?.taskTitle !== h.title
                return (
                  <li key={h.id} className="relative flex w-20 flex-col items-center gap-1.5" style={colorVars(h.color)}>
                    <button
                      type="button"
                      aria-pressed={status !== 'missed'}
                      aria-label={h.title}
                      title={record ? t('habits.offTimeTooltip', { date: dateKey, start: record.startTime, end: record.endTime }) : undefined}
                      onClick={() => toggleHabitDate(h.id, dateKey)}
                      className={`flex h-11 w-11 items-center justify-center rounded-full border-[3px] border-[var(--c)] transition-colors touch-manipulation ${
                        status === 'done'
                          ? 'bg-[var(--c)] text-[var(--on-c)]'
                          : status === 'offTime'
                          ? 'bg-[color-mix(in_srgb,var(--c)_35%,transparent)] text-[var(--on-c)]'
                          : 'hover:bg-[color-mix(in_srgb,var(--c)_12%,transparent)]'
                      }`}
                    >
                      {status !== 'missed' && (
                        <CheckIcon className="h-5 w-5" strokeWidth={3} />
                      )}
                    </button>
                    {canTime && (
                      <button
                        type="button"
                        onClick={() => {
                          startTimer(h.title)
                          // 時刻を決めていない習慣は記録で判定しないので、始めた時点で達成にする
                          if (!isTimedHabit(h)) toggleHabitDate(h.id, dateKey)
                        }}
                        aria-label={t('quickLog.resume', { title: h.title })}
                        title={t('quickLog.resume', { title: h.title })}
                        className="absolute left-1/2 top-7 ml-2.5 flex h-6 w-6 items-center justify-center rounded-full border border-zinc-200 bg-white text-[var(--c)] shadow-sm transition-colors hover:bg-zinc-50
                                   before:absolute before:-inset-2 before:content-[''] dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                      >
                        <PlayIcon className="h-2.5 w-2.5" />
                      </button>
                    )}
                    <span className="line-clamp-2 w-full text-center text-xs leading-snug text-zinc-600 dark:text-zinc-300">{h.title}</span>
                    {record && (
                      <span className="-mt-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">{t('planner.habitOffTime')}</span>
                    )}
                  </li>
                )
              })}
            </ul>
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
              <ChevronRightIcon className={`h-3 w-3 transition-transform ${showDone ? 'rotate-90' : ''}`} strokeWidth={2.5} />
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
              {untaggedLogs.length > 0 && (
                <button type="button" onClick={() => openDetail(untaggedLogs[0]!.id)} className={textButton}>
                  {t('planner.categorizeLogs', { count: untaggedLogs.length })}
                </button>
              )}
              <button type="button" onClick={() => { setCalendarMode('week'); selectView('calendar') }} className={textButton}>
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
