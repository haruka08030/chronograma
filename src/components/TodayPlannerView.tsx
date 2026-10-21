import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { addDays } from 'date-fns'
import { useTaskStore, selectLiveHabits } from '../store/taskStore'
import { isHabitScheduledOnDate } from '../lib/habitSchedule'
import { getDayLeftBehind, getDayPlan, nowOrNextPlan, showsDayResult } from '../lib/dayPlan'
import { getDayReviews } from '../lib/weekReview'
import { useNavShortcut } from '../lib/shortcuts'
import { onWrapUpRequest } from '../lib/notificationLaunch'
import { choosePlannerPane, openedPlannerPane } from '../lib/plannerPane'
import { minutesOfClock } from '../../supabase/functions/daily-reminders/schedule.ts'
import { unplannedListIds } from '../lib/listKind'
import { useDayLoads } from '../hooks/useDayLoads'
import { useNow } from '../hooks/useAppClock'
import { WeekCalendarView } from './WeekCalendarView'
import { isAppToday, appToday, appTodayKey } from '../lib/timeZone'
import { CalendarArrowIcon, CheckIcon } from './icons'
import { useTodayToggle } from '../hooks/useTodayToggle'
import { DayNav } from './ui/DayNav'
import { SelectionBar } from './ui/SelectionBar'
import { fromDateKey, toDateKey } from '../lib/dateKey'
import { DisclosureButton } from './ui/Disclosure'
import { useDateFormat } from '../hooks/useDateFormat'
import { SECTION_HEADING_CLASS } from './ui/headingClass'
import { openTaskMenu } from '../lib/overlays'
import { openTimeSlotForTask } from '../lib/timeSlotTarget'
import { useOpenTaskRow } from '../hooks/useOpenTaskRow'
import { useIsCoarsePointer, useIsDesktop } from '../hooks/useMediaQuery'
import { useTaskListSelection } from '../hooks/useTaskListSelection'
import { useBulkTaskActions } from '../hooks/useBulkTaskActions'
import { useDeferredComplete } from '../hooks/useDeferredComplete'
import { PlannerMobileBar, type PlannerPane } from './today/PlannerMobileBar'
import { PlannerHeader } from './today/PlannerHeader'
import { PlannerDues } from './today/PlannerDues'
import { PlannerTodoSection } from './today/PlannerTodoSection'
import { PlannerSuggestions } from './today/PlannerSuggestions'
import { PlannerHabitRows, PlannerHabits } from './today/PlannerHabits'
import { splitHabitDayKey } from '../lib/habitDayKey'
import { usePlannerHabitRows } from '../hooks/usePlannerHabitRows'
import { PlannerWrapUp } from './today/PlannerWrapUp'
import { PlannerTaskRow, type PlannerRowEnv } from './today/PlannerTaskRow'
import { usePlannerSuggestions, type CandidateGroup } from './today/usePlannerSuggestions'
import { useCalendarCards } from '../hooks/useCalendarCards'
import { useRememberScroll } from '../hooks/useRememberScroll'
import { CalendarCards } from './calendar/CalendarCards'
import { OverlaySuspense } from './ui/OverlaySuspense'
import { minutesOfDay } from '../lib/clockTime'

/** 気分の記号と見出しのその日の結果を出し始める時刻（朝から出さない）。設定の夜のまとめの時刻があればその時刻から */
const WRAP_UP_FROM_HOUR = 17

/** スマホ幅で最初から出す締切切れの行の数 */
const OVERDUE_PHONE_ROWS = 2

/** 画面の区切りの見出し（To-Do・習慣）。小さな灰色のラベルではなく、ひと目で区切りと分かる太さ */
const sectionHeading = `pb-2 ${SECTION_HEADING_CLASS}`

/**
 * 1 日単位の計画画面。左で「今日やること」を決め、右のタイムラインに置いて時間を確保する。
 * 情報は必要なときだけ出す: 候補（やり残し・締切間近）は畳んだ 1 行、締めは夕方か全部終わったとき。
 * 左の並び: 見出し（`PlannerHeader`）→ 引き落とし・期限（`PlannerDues`、追加機能）→ To-Do（`PlannerTodoSection`）→ 習慣 → 候補 → 完了 → 締め（`PlannerWrapUp`）
 */
export function TodayPlannerView() {
  const { t } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const habits = useTaskStore(selectLiveHabits)
  const rescheduleTasks = useTaskStore((s) => s.rescheduleTasks)
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const deferredComplete = useDeferredComplete(toggleTask)
  // 習慣も同じく残してから移す。押した日で達成にするので、日を変えてもずれないよう「id|日付」で待つ
  const toggleHabitDate = useTaskStore((s) => s.toggleHabitDate)
  const deferredHabit = useDeferredComplete(
    useCallback(
      (key: string) => {
        const [habitId, day] = splitHabitDayKey(key)
        toggleHabitDate(habitId, day)
      },
      [toggleHabitDate],
    ),
  )
  const deleteTasks = useTaskStore((s) => s.deleteTasks)
  const todayToggle = useTodayToggle()
  const bulk = useBulkTaskActions()
  const now = useNow()
  // 行を押したとき: PC は詳細、スマホは短いシート（To-Do 一覧と同じ）
  const openDetail = useOpenTaskRow()
  const isCoarse = useIsCoarsePointer()
  const isDesktop = useIsDesktop()

  // 見ている日はカレンダー・習慣と共有する（d / w / m で切り替えても同じ日・その日を含む週と月が出る）
  const dateKey = useTaskStore((s) => s.selectedCalendarDateKey)
  const setDateKey = useTaskStore((s) => s.setSelectedCalendarDateKey)
  useNavShortcut({
    today: () => setDateKey(toDateKey(appToday())),
    prev: () => setDateKey(toDateKey(addDays(fromDateKey(dateKey), -1))),
    next: () => setDateKey(toDateKey(addDays(fromDateKey(dateKey), 1))),
  })
  /** 開け閉めを選んだらそれに従う。選ぶまでは、明日までの締切があるときだけ開いておく */
  const [suggestionsChoice, setSuggestionsChoice] = useState<boolean | null>(null)
  const [showDone, setShowDone] = useState(false)
  const [showLeftOver, setShowLeftOver] = useState(false)
  const [showAllOverdue, setShowAllOverdue] = useState(false)
  const listScrollRef = useRef<HTMLElement>(null)
  useRememberScroll(listScrollRef, 'planner')
  /** 夜のまとめの通知から開いた回数。1 以上なら時刻に関係なく気分の記号を出す（PC はそこまでスクロールする）。スマホはその日のタイムラインの面を出す */
  const [wrapUpFocus, setWrapUpFocus] = useState(0)
  useEffect(
    () =>
      onWrapUpRequest(() => {
        // その日の予定と記録のずれを見せる（スマホはタイムラインの面。気分の印は「やること」の一番下のまま）
        choosePlannerPane('timeline', appTodayKey())
        setPaneOf((p) => ({ ...p, dateKey: appTodayKey(), pane: 'timeline' }))
        setWrapUpFocus((n) => n + 1)
      }),
    [],
  )
  const wrapUpTime = useTaskStore((s) => s.dailyReminders.wrapUpTime ?? null)
  /** 見ている日に気分を付けたか（付けた日は締めの時刻の前でも記号の行を出しておく） */
  const moodSet = useTaskStore((s) => s.dayMoods[dateKey] !== undefined)

  const date = fromDateKey(dateKey)
  const viewingToday = isAppToday(date)
  const df = useDateFormat()
  const tomorrowKey = toDateKey(addDays(date, 1))

  const lists = useTaskStore((s) => s.lists)
  const excludedListIds = useMemo(() => unplannedListIds(lists), [lists])
  const {
    overdue: overdueAll,
    carryOver,
    dueSoon,
    open,
    done,
    loggedMinutes,
  } = useMemo(() => getDayPlan(tasks, dateKey, excludedListIds), [tasks, dateKey, excludedListIds])
  // 過ぎた日（と今日の締めの時刻から）は、見出しの予定の代わりにその日の結果（ふりかえりの 1 日分と同じ数え方）
  const wrapUpFrom = minutesOfClock(wrapUpTime) ?? WRAP_UP_FROM_HOUR * 60
  const nowMinutes = minutesOfDay(now)
  const todayKey = toDateKey(appToday())
  const showResult = showsDayResult(dateKey, todayKey, nowMinutes, wrapUpFrom)
  /**
   * スマホ幅では左右に並べられないので「やること / タイムライン」を切り替える。
   * 開いたとき（見る日を変えた・アプリに戻った）の面は、選ぶ前か決めた後かで決める（`openedPlannerPane`）。
   * 見ている間に締めの時刻を過ぎても勝手に替えない
   */
  const [opened, setOpened] = useState(0)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setOpened((n) => n + 1)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])
  const [paneOf, setPaneOf] = useState(() => ({ dateKey, opened, pane: openedPlannerPane(dateKey, wrapUpFrom) }))
  const paneCurrent = paneOf.dateKey === dateKey && paneOf.opened === opened
  if (!paneCurrent) setPaneOf({ dateKey, opened, pane: openedPlannerPane(dateKey, wrapUpFrom) })
  const mobilePane = paneCurrent ? paneOf.pane : openedPlannerPane(dateKey, wrapUpFrom)
  const setMobilePane = (pane: PlannerPane) => {
    choosePlannerPane(pane, todayKey)
    setPaneOf({ dateKey, opened, pane })
  }
  // 今日は時間が進むと終わった予定が増えるので、今日を見ている間は分ごとに数え直す
  const resultMinute = viewingToday ? nowMinutes : 0
  const dayResult = useMemo(
    () => (showResult ? (getDayReviews(tasks, habits, [fromDateKey(dateKey)], excludedListIds)[0] ?? null) : null),
    // resultMinute は数え直す合図（getDayReviews は今の時刻を自分で読む）
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showResult, tasks, habits, dateKey, excludedListIds, resultMinute],
  )
  /** 見出しの「予定 / 空き」。週の見出しと同じ計算（授業・バイト・Google の予定を引いた空きと、置いた To-Do の時間・見積もり） */
  const dayLoad = useDayLoads([dateKey]).get(dateKey)!
  // 今日やる行を、時間を決めたもの（時刻順）と時間未定に分ける
  const timedOpen = useMemo(() => open.filter((x) => x.startTime && x.endTime), [open])
  const untimedOpen = useMemo(() => open.filter((x) => !(x.startTime && x.endTime)), [open])
  // スマホは横にタイムラインが無いので、今日やる行の一番上に今・次の 1 件（時間を決めた To-Do・予定・Google の予定）。PC は出さない
  const calendarEvents = useTaskStore((s) => s.calendarEvents)
  const nowNext = useMemo(
    () => (viewingToday && !isDesktop ? nowOrNextPlan({ timed: timedOpen, tasks, events: calendarEvents, dateKey }, now) : null),
    [viewingToday, isDesktop, timedOpen, tasks, calendarEvents, dateKey, now],
  )
  // 一番上に出している To-Do は、その間は下の時間を決めた行から外す（同じ行を 2 回出さない）
  const nowNextTask = nowNext?.source === 'task' ? nowNext.task : null
  const timedShown = useMemo(() => (nowNextTask ? timedOpen.filter((x) => x.id !== nowNextTask.id) : timedOpen), [timedOpen, nowNextTask])
  // 予定（✓ の無いもの）を押したときのカード（タイムラインと同じ）
  const cards = useCalendarCards()
  // 締切は焦らせてよい: 期限切れは畳まず、今日のリストの先頭に赤い日付つきで出す（今日を見ているときだけ）
  const overdue = useMemo(() => (viewingToday ? overdueAll : []), [viewingToday, overdueAll])
  // スマホ幅は締切切れが今日やる行を画面の外へ押し出さないよう 2 行まで（残りは「他 N 件」で開く）。PC は全部
  const overdueShown = useMemo(
    () => (isDesktop || showAllOverdue ? overdue : overdue.slice(0, OVERDUE_PHONE_ROWS)),
    [isDesktop, showAllOverdue, overdue],
  )
  // やり残し（前の日に置いて終わっていないもの）は今日を見ているときだけ、リストの上に 1 行で出してまとめて今日へ移せる
  const leftOver = useMemo(() => (viewingToday ? carryOver : []), [viewingToday, carryOver])
  // 過ぎた日だけ: その日に置いて、後日に終えた・別の日へ移したもの（一覧から消えるので、残したことを見返せるように）
  const pastDay = dateKey < toDateKey(appToday())
  const leftBehind = useMemo(
    () => (pastDay ? getDayLeftBehind(tasks, dateKey, excludedListIds) : []),
    [pastDay, tasks, dateKey, excludedListIds],
  )
  const suggestions = dueSoon
  // 明日までが締切の To-Do は、畳んだ見出しの中に隠さない（今日やるかを決めるのに要る）
  const dueByTomorrow = viewingToday && dueSoon.some((x) => x.dueDate !== null && x.dueDate <= tomorrowKey)
  const showSuggestions = suggestionsChoice ?? dueByTomorrow
  const candidateView = useTaskStore((s) => s.plannerCandidateView)
  const {
    moreSuggestions,
    candidateGroups,
    dueGroups,
    remaining: moreRemaining,
    showMore,
    shownSuggestions,
  } = usePlannerSuggestions({
    tasks,
    dateKey,
    excludedListIds,
    suggestions,
    view: candidateView,
  })
  const candidatePool = useMemo(() => [...suggestions, ...moreSuggestions], [suggestions, moreSuggestions])

  const dayHabits = useMemo(
    () => habits.filter((h) => isHabitScheduledOnDate(h, date)),
    // date は dateKey から毎回作り直すので key で依存を取る
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [habits, dateKey],
  )
  const habitRows = usePlannerHabitRows(dayHabits, dateKey)
  /** 「完了 N 件」の数（終えた To-Do と済んだ習慣） */
  const doneCount = done.length + habitRows.done.length

  // 行のキー操作・選択・右クリックは To-Do 一覧と同じ（↑↓・Shift・⌘A・Enter・Space・Delete・⌘Enter・⌘/・Esc）。
  // 対象は開いている行を上から順に（完了は欄を開いているときだけ）
  const rowIds = useMemo(
    () =>
      [
        ...overdueShown,
        ...(showLeftOver ? leftOver : []),
        ...(nowNextTask ? [nowNextTask] : []),
        ...untimedOpen,
        ...timedShown,
        ...(showSuggestions ? candidateGroups.flatMap((g) => g.tasks) : []),
        // 完了の欄を開いているときは、その行も（Space で完了を外す）
        ...(showDone ? done : []),
      ].map((x) => x.id),
    [showLeftOver, leftOver, overdueShown, nowNextTask, untimedOpen, timedShown, showSuggestions, candidateGroups, showDone, done],
  )
  const clearSelectedRef = useRef<() => void>(() => {})
  const { selected, clearSelection, makeRowClick, makeSelection, listboxProps } = useTaskListSelection({
    rowIds,
    openDetail,
    toggleRow: toggleTask,
    removeRows: deleteTasks,
    completeRows: bulk.toggleComplete,
    openMenu: (m) => openTaskMenu({ kind: 'task', ...m, onDone: () => clearSelectedRef.current() }),
    todayToggleRows: (ids) => todayToggle(ids).run(),
    // S: 「時間を決める」は見ている日の空きから（候補・やり残しの行も、置くとこの日にやる行になる）
    pickTimeRow: (id) => openTimeSlotForTask(id, dateKey),
    // 候補の最後の行で ↓ を押すと「さらに表示」と同じく足す
    onShowMore: showSuggestions && moreRemaining > 0 ? showMore : undefined,
    resetOn: [dateKey],
  })
  useEffect(() => {
    clearSelectedRef.current = clearSelection
  }, [clearSelection])

  /**
   * 選んでいる間に下のバーに出す操作。この画面でよく使う日の付け替えを先頭に:
   * 今日やる行だけなら「明日へ」、候補・やり残し・期限切れだけなら「今日やる」、混ざっていれば完了だけ
   */
  const selectionActions = (() => {
    const ids = [...selected]
    const openIds = new Set(open.map((x) => x.id))
    const complete = {
      label: t('taskList.selectionComplete'),
      icon: <CheckIcon className="h-3.5 w-3.5" strokeWidth={2.5} />,
      onClick: () => bulk.complete(ids),
    }
    const many = (label: string) => (ids.length > 1 ? label : undefined)
    // 完了の行が混ざっていれば、日の付け替え・完了は出さない（「操作」のメニューから）
    const doneIds = new Set(done.map((x) => x.id))
    if (ids.some((id) => doneIds.has(id))) return []
    if (ids.every((id) => openIds.has(id))) {
      return [
        {
          // 別の日を見ているときは、見ている日の翌日へ（本当の明日ではない）
          label: viewingToday ? t('taskList.selectionTomorrow') : t('taskList.selectionNextDay'),
          icon: <CalendarArrowIcon className="h-3.5 w-3.5" />,
          onClick: () =>
            rescheduleTasks(
              ids,
              tomorrowKey,
              many(t(viewingToday ? 'undo.tasksMovedToTomorrow' : 'undo.tasksMovedToNextDay', { count: ids.length })),
            ),
        },
        complete,
      ]
    }
    if (ids.every((id) => !openIds.has(id))) {
      return [
        {
          label: viewingToday ? t('planner.doToday') : t('planner.doThisDay'),
          icon: <CalendarArrowIcon className="h-3.5 w-3.5" />,
          onClick: () => rescheduleTasks(ids, dateKey, many(t('undo.tasksMovedToToday', { count: ids.length }))),
        },
        complete,
      ]
    }
    return [complete]
  })()

  const totalCount = open.length + done.length
  // 気分の記号は締めの時刻から（To-Do が無い日・全部終えた日も。早い時刻に全部終えても夜まで待つ）。付けた日はそのまま出しておく
  const showMood = viewingToday && (wrapUpFocus > 0 || moodSet || nowMinutes >= wrapUpFrom)

  // 候補・完了の行は追加欄より下にあるので、listbox には aria-owns で入れる
  const idPrefix = useId()
  const suggestionGroupId = (group: CandidateGroup) => `${idPrefix}due-${group.kind === 'day' ? group.dueDate : group.kind}`
  const doneGroupId = `${idPrefix}done`
  const ownedGroupIds = [...(showSuggestions ? candidateGroups.map(suggestionGroupId) : []), ...(showDone ? [doneGroupId] : [])]

  /** 行が共通で使うもの */
  const rowEnv: PlannerRowEnv = {
    day: { dateKey, date, tomorrowKey, now, t, shortDate: (key) => df.shortDate(key) },
    viewingToday,
    rowIds,
    selectedCount: selected.size,
    makeSelection,
    makeRowClick,
    openDetail,
    deferredComplete,
    isCoarse,
  }

  const dayNav = (
    <DayNav
      onToday={() => setDateKey(toDateKey(appToday()))}
      onPrev={() => setDateKey(toDateKey(addDays(date, -1)))}
      onNext={() => setDateKey(tomorrowKey)}
      prevLabel={t('planner.prevDay')}
      nextLabel={t('planner.nextDay')}
      atToday={viewingToday}
      shortcuts
    />
  )

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden md:flex-row">
      <PlannerMobileBar pane={mobilePane} onPaneChange={setMobilePane} />

      <section
        ref={listScrollRef}
        className={`${mobilePane === 'list' ? 'flex' : 'hidden'} timer-safe min-h-0 w-full flex-1 flex-col overflow-y-auto border-zinc-100 dark:border-zinc-800
                    md:flex md:w-[380px] md:flex-none md:shrink-0 md:border-r`}
      >
        <PlannerHeader
          date={date}
          dateKey={dateKey}
          viewingToday={viewingToday}
          dayNav={dayNav}
          load={dayLoad}
          loggedMinutes={loggedMinutes}
          dayResult={dayResult}
        />

        <PlannerDues dateKey={dateKey} />

        <PlannerTodoSection
          env={rowEnv}
          overdue={overdue}
          overdueShown={overdueShown}
          onShowAllOverdue={() => setShowAllOverdue(true)}
          leftOver={leftOver}
          showLeftOver={showLeftOver}
          onToggleLeftOver={() => setShowLeftOver((v) => !v)}
          open={open}
          timedOpen={timedShown}
          nowNext={nowNext}
          onOpenPlanCard={(plan, el) =>
            plan.source === 'google' ? cards.openGoogleCard(plan.event.id, el) : cards.openCard(plan.task.id, el)
          }
          untimedOpen={untimedOpen}
          totalCount={totalCount}
          listboxProps={listboxProps}
          ownedGroupIds={ownedGroupIds}
          leftBehind={leftBehind}
        />

        {/* 習慣はその日やると決まっているもの。まだ選ぶ前の候補より上に */}
        {habitRows.open.length > 0 && (
          <PlannerHabits
            rows={habitRows.open}
            habitRecords={habitRows.habitRecords}
            dateKey={dateKey}
            viewingToday={viewingToday}
            headingClass={sectionHeading}
            deferred={deferredHabit}
          />
        )}

        {(suggestions.length > 0 || moreSuggestions.length > 0) && (
          <PlannerSuggestions
            env={rowEnv}
            addAllTargets={shownSuggestions}
            pool={candidatePool}
            candidateGroups={candidateGroups}
            dueGroups={dueGroups}
            open={showSuggestions}
            onToggle={() => setSuggestionsChoice(!showSuggestions)}
            remaining={moreRemaining}
            onShowMore={showMore}
            groupId={suggestionGroupId}
          />
        )}

        {/* 終えた To-Do と習慣は 1 か所に（To-Do が先、習慣はその後。習慣は自分の色の丸のまま） */}
        {doneCount > 0 && (
          <div className="mt-6 px-3">
            <DisclosureButton tone="muted" open={showDone} onToggle={() => setShowDone((v) => !v)}>
              {t('planner.doneHeading', { count: doneCount })}
            </DisclosureButton>
            {showDone && (
              <>
                <ul id={doneGroupId} role="group" aria-label={t('planner.doneHeading', { count: done.length })}>
                  {done.map((task) => (
                    <PlannerTaskRow key={task.id} task={task} env={rowEnv} />
                  ))}
                </ul>
                {habitRows.done.length > 0 && (
                  <PlannerHabitRows
                    rows={habitRows.done}
                    habitRecords={habitRows.habitRecords}
                    dateKey={dateKey}
                    viewingToday={viewingToday}
                    ariaLabel={t('planner.habitsHeading')}
                  />
                )}
              </>
            )}
          </div>
        )}

        <PlannerWrapUp showMood={showMood} dateKey={dateKey} focusKey={wrapUpFocus} totalCount={totalCount} />
      </section>

      <section className={`${mobilePane === 'timeline' ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-1 flex-col md:flex`}>
        {/* スマホのタイムラインのタブにも、何日を見ているかと前後の日へ（PC は左の見出しにある） */}
        <div className="flex shrink-0 items-center justify-between gap-2 px-4 pb-2 md:hidden">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{df.monthDayWeekdayLong(date)}</p>
          {dayNav}
        </div>
        <WeekCalendarView key={dateKey} anchor={date} selectedDateKey={dateKey} singleDay />
      </section>

      <SelectionBar selectedIds={selected} actions={selectionActions} onClear={clearSelection} />
      <OverlaySuspense>
        <CalendarCards cards={cards} />
      </OverlaySuspense>
    </div>
  )
}
