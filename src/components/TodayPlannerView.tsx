import { useEffect, useMemo, useRef, useState } from 'react'
import { formatDuration } from '../lib/timeGrid'
import { useTranslation } from 'react-i18next'
import { addDays, format } from 'date-fns'
import { useTaskStore, INBOX_LIST_ID } from '../store/taskStore'
import { isHabitScheduledOnDate } from '../lib/habitSchedule'
import { addTaskFromQuickText } from '../lib/quickAddTask'
import { getDayPlan, getMoreSuggestions } from '../lib/dayPlan'
import { isActiveTask } from '../lib/taskLifecycle'
import { minutesOfLogOnCalendarDay } from '../lib/taskTimeRange'
import { useNavShortcut } from '../lib/shortcuts'
import { unplannedListIds } from '../lib/listKind'
import { requestPermission } from '../lib/notifications'
import { startTaskDrag } from '../lib/taskDrag'
import { DUE_TONE_CLASS } from './ui/dueTone'
import { startTimerForTask } from '../lib/timerDrop'
import { startNativeTaskDragGhost } from '../lib/nativeTaskDragGhost'
import { useTaskDetailModal } from '../hooks/useTaskDetailModal'
import { useCompleteWithLog } from '../hooks/useCompleteWithLog'
import { useNowMinuteTick } from '../hooks/useNowMinuteTick'
import { TaskDetail } from './TaskDetail'
import { WeekCalendarView } from './WeekCalendarView'
import { RecordPanel } from './RecordPanel'
import { SleepRow } from './SleepRow'
import type { Task } from '../types/task'
import { buildHabitRecordIndex, habitDayStatus, habitRecordFor, isTimedHabit } from '../lib/habitTiming'
import { colorVars } from '../lib/logCategoryColors'
import { isSleepRecord } from '../lib/sleep'
import { isAppToday, appToday } from '../lib/timeZone'
import { CalendarArrowIcon, CalendarDoubleArrowIcon, CheckIcon, PlayIcon } from './icons'
import { tip } from '../lib/tooltip'
import { buttonClass } from './ui/buttonClass'
import { Segmented } from './ui/Segmented'
import { CompletionCircle } from './ui/CompletionCircle'
import { DayNav } from './ui/DayNav'
import { RowActionButton } from './ui/RowActionButton'
import { dateFnsLocale, fromDateKey, toDateKey } from '../lib/dateKey'
import { TaskContextMenu } from './TaskContextMenu'
import { InlineAddInput } from './ui/InlineAddInput'
import { DisclosureButton } from './ui/Disclosure'

const META_TONE_CLASS = {
  muted: DUE_TONE_CLASS.past,
  overdue: DUE_TONE_CLASS.overdue,
  today: DUE_TONE_CLASS.today,
  tomorrow: DUE_TONE_CLASS.tomorrow,
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
  const rescheduleTasks = useTaskStore((s) => s.rescheduleTasks)
  const toggleHabitDate = useTaskStore((s) => s.toggleHabitDate)
  const startTimer = useTaskStore((s) => s.startTimer)
  const reminderPromptDismissed = useTaskStore((s) => s.reminderPromptDismissed)
  const enableRecommendedNotifications = useTaskStore((s) => s.enableRecommendedNotifications)
  const anyNotification = useTaskStore((s) => Boolean(s.dailyReminders.planTime) || s.eventReminderMinutes != null || s.notificationsEnabled)
  const dismissReminderPrompt = useTaskStore((s) => s.dismissReminderPrompt)
  const dailyCapacityMinutes = useTaskStore((s) => s.dailyCapacityMinutes)
  const now = useNowMinuteTick()
  const { detailTask, openDetail, closeDetail } = useTaskDetailModal(tasks)
  const [rowMenu, setRowMenu] = useState<{ x: number; y: number; taskId: string } | null>(null)
  const { open: openCompleteWithLog, modal: completeWithLogModal } = useCompleteWithLog()

  const [dateKey, setDateKey] = useState(() => toDateKey(appToday()))
  useNavShortcut({
    today: () => setDateKey(toDateKey(appToday())),
    prev: () => setDateKey((k) => toDateKey(addDays(fromDateKey(k), -1))),
    next: () => setDateKey((k) => toDateKey(addDays(fromDateKey(k), 1))),
  })
  const [draft, setDraft] = useState('')
  const [draftFocused, setDraftFocused] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const [showLeftOver, setShowLeftOver] = useState(false)
  /** スマホ幅では左右に並べられないので「やること / タイムライン」を切り替える */
  const [mobilePane, setMobilePane] = useState<'list' | 'timeline'>('list')

  const date = fromDateKey(dateKey)
  const viewingToday = isAppToday(date)
  const dateLocale = dateFnsLocale(i18n.resolvedLanguage)
  const tomorrowKey = toDateKey(addDays(date, 1))

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
  // やり残し（前の日に置いて終わっていないもの）は今日を見ているときだけ、リストの上に 1 行で出してまとめて今日へ移せる
  const leftOver = viewingToday ? carryOver : []
  const suggestions = dueSoon
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

  const shortDate = (key: string) => format(fromDateKey(key), t('planner.shortDateFormat'), { locale: dateLocale })

  const submitDraft = () => {
    if (!draft.trim()) return
    // この画面で足したものは「やる日」＝見ている日。書き方の解釈は To-Do 画面と同じ
    addTaskFromQuickText(draft, { defaultListId: INBOX_LIST_ID, defaultDate: dateKey })
    setDraft('')
  }

  const totalCount = open.length + done.length
  const overCapacity = dateKey >= toDateKey(appToday()) && plannedMinutes > dailyCapacityMinutes
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
          startTaskDrag(e, task.id)
          startNativeTaskDragGhost(e, task.title)
        }}
        className="group/row flex min-h-11 items-center gap-3 rounded-lg px-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
        // To-Do 一覧と同じタスクのメニュー
        onContextMenu={(e) => {
          e.preventDefault()
          setRowMenu({ x: e.clientX, y: e.clientY, taskId: task.id })
        }}
      >
        <CompletionCircle
          completed={task.completed}
          priority={task.priority}
          // To-Do 画面と同じ: 時刻つきの予定は「記録して完了」を開く（時刻なし・完了済みはそのまま切り替え）
          onClick={() => openCompleteWithLog(task)}
          label={task.completed ? t('taskItem.markIncomplete') : task.startTime && task.endTime ? t('taskItem.completeWithLog') : t('taskItem.markComplete')}
        />
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
    <RowActionButton label={t('planner.startTimer')} onClick={() => startTimerForTask(task.id)} revealOnHover>
      <PlayIcon className="h-3 w-3" />
    </RowActionButton>
  )

  /** 候補・やり残しの行の「今日やる」（ほかの日を見ているときは「この日にやる」）。カレンダーに矢印＝その日へ移す */
  const moveHereButton = (task: Task) => (
    <RowActionButton
      label={viewingToday ? t('planner.doToday') : t('planner.doThisDay')}
      onClick={() => rescheduleTasks([task.id], dateKey)}
    >
      <CalendarArrowIcon className="h-4 w-4" />
    </RowActionButton>
  )

  const moveAllLeftOver = () =>
    rescheduleTasks(
      leftOver.map((x) => x.id),
      dateKey,
      leftOver.length > 1 ? t('undo.tasksMovedToToday', { count: leftOver.length }) : undefined,
    )

  const textButton = buttonClass({ variant: 'link', size: 'xs' })
  /** 1 日を締める操作。文に混ぜず、メッセージの下に並べる（スマホでも押しやすい高さ） */
  const wrapUpButton = buttonClass({ variant: 'secondary', size: 'sm' }, 'min-h-9 md:min-h-8')
  /** 画面の区切りの見出し（To-Do・習慣）。小さな灰色のラベルではなく、ひと目で区切りと分かる太さ */
  const sectionHeading = 'pb-2 text-base font-semibold text-zinc-900 dark:text-zinc-100'

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
            <DayNav
              onToday={() => setDateKey(toDateKey(appToday()))}
              onPrev={() => setDateKey(toDateKey(addDays(date, -1)))}
              onNext={() => setDateKey(tomorrowKey)}
              prevLabel={t('planner.prevDay')}
              nextLabel={t('planner.nextDay')}
              atToday={viewingToday}
              shortcuts
            />
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
                  {t('planner.summaryLogged', { time: formatDuration(loggedMinutes) })}
                </span>
              ) : <span />}
              {plannedMinutes > 0 && (
                <span
                  className={`whitespace-nowrap text-xs tabular-nums ${overCapacity ? DUE_TONE_CLASS.overdue : 'text-zinc-400 dark:text-zinc-500'}`}
                  title={overCapacity ? t('planner.overCapacity', { capacity: formatDuration(dailyCapacityMinutes) }) : undefined}
                >
                  {t('planner.summaryPlanned', { time: formatDuration(plannedMinutes) })}
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

        <h2 className={`${sectionHeading} px-6`}>{t('planner.todoHeading')}</h2>

        {leftOver.length > 0 && (
          <div className="mt-2 px-3">
            {/* 見出しの右に「すべて今日へ」（» の二重矢印）、開くと行ごとに「今日やる」（→）。どちらも行のアイコンと同じ列 */}
            <div className="flex items-center gap-3 pr-3">
              <DisclosureButton tone="alert" open={showLeftOver} onToggle={() => setShowLeftOver((v) => !v)} className="flex-1">
                <span className="truncate">{t('planner.carryOverHeading', { count: leftOver.length })}</span>
              </DisclosureButton>
              {leftOver.length > 1 ? (
                <RowActionButton label={t('planner.moveAllToToday')} onClick={moveAllLeftOver}>
                  <CalendarDoubleArrowIcon className="h-4 w-4" />
                </RowActionButton>
              ) : (
                // 1 件なら行の「今日やる」と同じ。開いたら行の方だけにする
                !showLeftOver && moveHereButton(leftOver[0]!)
              )}
            </div>
            {showLeftOver && (
              <ul>
                {leftOver.map((task) => renderRow(task, moveHereButton(task)))}
              </ul>
            )}
          </div>
        )}

        <ul className="px-3">
          {overdue.map((task) => renderRow(task, timerButton(task)))}
          {open.map((task) => renderRow(task, timerButton(task)))}
        </ul>

        {/* 追加は並んだ行の下（見出しのすぐ下に空の欄を置かない） */}
        <div className="relative mt-1 px-3">
          <InlineAddInput
            underline
            data-quickadd
            value={draft}
            onValueChange={setDraft}
            onSubmit={submitDraft}
            onFocus={() => setDraftFocused(true)}
            onBlur={() => setDraftFocused(false)}
            placeholder={t('planner.addPlaceholder')}
            aria-describedby="planner-add-hint"
          />
          {/* 浮かせて出す。行の流れに入れると、欄を離れた瞬間に下の行がずれて押し間違える */}
          <p
            id="planner-add-hint"
            className={draftFocused
              ? 'pointer-events-none absolute inset-x-3 top-full z-10 bg-white px-11 pb-1 text-xs text-zinc-400 dark:bg-zinc-900 dark:text-zinc-500'
              : 'sr-only'}
          >
            {t('planner.addHint')}
          </p>
        </div>

        {totalCount > 0 && open.length === 0 && overdue.length === 0 && (
          <p className="px-6 pt-2 text-sm text-zinc-500 dark:text-zinc-400">{t('planner.allDone')}</p>
        )}

        {(suggestions.length > 0 || moreSuggestions.length > 0) && (
          <div className="mt-6 px-3">
            <DisclosureButton open={showSuggestions} onToggle={() => setShowSuggestions((v) => !v)} className="w-full">
              <span className="flex-1">
                {suggestions.length > 0 ? t('planner.suggestionsHeading', { count: suggestions.length }) : t('planner.suggestionsHeadingPlain')}
              </span>
            </DisclosureButton>
            {showSuggestions && (
              <>
                <ul>
                  {suggestions.map((task) => (
                    renderRow(
                      task,
                      moveHereButton(task),
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
                          moveHereButton(task),
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
            <h2 className={`${sectionHeading} px-3`}>{t('planner.habitsHeading')}</h2>
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
                      {...tip(record ? t('habits.offTimeTooltip', { date: dateKey, start: record.startTime, end: record.endTime }) : undefined)}
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
                        {...tip(t('quickLog.resume', { title: h.title }))}
                        className="absolute left-1/2 top-7 ml-2.5 flex h-6 w-6 items-center justify-center rounded-full border border-zinc-200 bg-white text-[var(--c)] shadow-sm transition-colors hover:bg-zinc-50
                                   before:absolute before:-inset-2 before:content-[''] dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                      >
                        <PlayIcon className="h-2.5 w-2.5" />
                      </button>
                    )}
                    <span className="line-clamp-2 w-full text-center text-xs leading-snug text-zinc-600 dark:text-zinc-300">{h.title}</span>
                    {record && (
                      <span className="-mt-1 text-[10px] text-zinc-400 dark:text-zinc-500">{t('planner.habitOffTime')}</span>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {done.length > 0 && (
          <div className="mt-6 px-3">
            <DisclosureButton tone="muted" open={showDone} onToggle={() => setShowDone((v) => !v)}>
              {t('planner.doneHeading', { count: done.length })}
            </DisclosureButton>
            {showDone && (
              <ul>
                {done.map((task) => renderRow(task))}
              </ul>
            )}
          </div>
        )}

        <footer className="mt-auto space-y-2 px-6 pb-6 pt-8 text-sm">
          {showWrapUp && (open.length > 0 || untaggedLogs.length > 0) && (
            <div className="space-y-2">
              {open.length > 0 && (
                <p className="text-zinc-600 dark:text-zinc-300">{t('planner.wrapUpRemaining', { count: open.length })}</p>
              )}
              <div className="flex flex-wrap gap-2">
                {open.length > 0 && (
                  <button type="button" onClick={() => rescheduleTasks(open.map((x) => x.id), tomorrowKey)} className={wrapUpButton}>
                    {t('planner.moveRestToTomorrow')}
                  </button>
                )}
                {untaggedLogs.length > 0 && (
                  <button type="button" onClick={() => openDetail(untaggedLogs[0]!.id)} className={wrapUpButton}>
                    {t('planner.categorizeLogs', { count: untaggedLogs.length })}
                  </button>
                )}
              </div>
            </div>
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
      {rowMenu && (
        <TaskContextMenu x={rowMenu.x} y={rowMenu.y} taskIds={[rowMenu.taskId]} onClose={() => setRowMenu(null)} onOpenDetail={openDetail} />
      )}
      {completeWithLogModal}
    </div>
  )
}
