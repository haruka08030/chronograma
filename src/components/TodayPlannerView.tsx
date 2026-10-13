import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { addDays } from 'date-fns'
import { useTaskStore } from '../store/taskStore'
import { isHabitScheduledOnDate } from '../lib/habitSchedule'
import { getDayPlan } from '../lib/dayPlan'
import { isActiveTask } from '../lib/taskLifecycle'
import { minutesOfLogOnCalendarDay } from '../lib/taskTimeRange'
import { useNavShortcut } from '../lib/shortcuts'
import { onWrapUpRequest } from '../lib/notificationLaunch'
import { minutesOfClock } from '../../supabase/functions/daily-reminders/schedule.ts'
import { unplannedListIds } from '../lib/listKind'
import { useDayLoads } from '../hooks/useDayLoads'
import { useNow } from '../hooks/useAppClock'
import { WeekCalendarView } from './WeekCalendarView'
import { isLogTask, isSleepTask } from '../types/task'
import { isAppToday, appToday } from '../lib/timeZone'
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
import { useIsCoarsePointer } from '../hooks/useMediaQuery'
import { useTaskListSelection } from '../hooks/useTaskListSelection'
import { useBulkTaskActions } from '../hooks/useBulkTaskActions'
import { useDeferredComplete } from '../hooks/useDeferredComplete'
import { PlannerMobileBar, type PlannerPane } from './today/PlannerMobileBar'
import { PlannerHeader } from './today/PlannerHeader'
import { PlannerTodoSection } from './today/PlannerTodoSection'
import { PlannerSuggestions } from './today/PlannerSuggestions'
import { PlannerHabits } from './today/PlannerHabits'
import { PlannerWrapUp } from './today/PlannerWrapUp'
import { PlannerTaskRow, type PlannerRowEnv } from './today/PlannerTaskRow'
import { usePlannerSuggestions, type CandidateGroup } from './today/usePlannerSuggestions'

/** 「1 日を締める」を出し始める時刻（朝から締めの話をしない）。設定の夜の締めの時刻があればその時刻から */
const WRAP_UP_FROM_HOUR = 17

/** 画面の区切りの見出し（To-Do・習慣）。小さな灰色のラベルではなく、ひと目で区切りと分かる太さ */
const sectionHeading = `pb-2 ${SECTION_HEADING_CLASS}`

/**
 * 1 日単位の計画画面。左で「今日やること」を決め、右のタイムラインに置いて時間を確保する。
 * 情報は必要なときだけ出す: 候補（やり残し・締切間近）は畳んだ 1 行、締めは夕方か全部終わったとき。
 * 左の並び: 見出し（`PlannerHeader`）→ To-Do（`PlannerTodoSection`）→ 候補 → 習慣 → 完了 → 締め（`PlannerWrapUp`）
 */
export function TodayPlannerView() {
  const { t } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const habits = useTaskStore((s) => s.habits)
  const rescheduleTasks = useTaskStore((s) => s.rescheduleTasks)
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const deferredComplete = useDeferredComplete(toggleTask)
  const deleteTasks = useTaskStore((s) => s.deleteTasks)
  const todayToggle = useTodayToggle()
  const bulk = useBulkTaskActions()
  const now = useNow()
  // 行を押したとき: PC は詳細、スマホは短いシート（To-Do 一覧と同じ）
  const openDetail = useOpenTaskRow()
  const isCoarse = useIsCoarsePointer()

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
  /** スマホ幅では左右に並べられないので「やること / タイムライン」を切り替える */
  const [mobilePane, setMobilePane] = useState<PlannerPane>('list')
  /** 夜の締めの通知から開いた回数。1 以上なら時刻・件数に関係なく締めを出し、そこまでスクロールする */
  const [wrapUpFocus, setWrapUpFocus] = useState(0)
  useEffect(
    () =>
      onWrapUpRequest(() => {
        setMobilePane('list')
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
  /** 推定でも分類が決まらなかった今日の記録（1 日を締めるときにまとめて付ける） */
  const untaggedLogs = useMemo(
    () =>
      tasks
        .filter(
          (x) => isLogTask(x) && isActiveTask(x) && !isSleepTask(x) && x.tags.length === 0 && minutesOfLogOnCalendarDay(x, dateKey) > 0,
        )
        .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? '')),
    [tasks, dateKey],
  )
  const {
    overdue: overdueAll,
    carryOver,
    dueSoon,
    open,
    done,
    loggedMinutes,
  } = useMemo(() => getDayPlan(tasks, dateKey, excludedListIds), [tasks, dateKey, excludedListIds])
  /** 見出しの「予定 / 空き」。週の見出しと同じ計算（授業・バイト・Google の予定を引いた空きと、置いた To-Do の時間・見積もり） */
  const dayLoad = useDayLoads([dateKey]).get(dateKey)!
  // 今日やる行を、時間を決めたもの（時刻順）と時間未定に分ける
  const timedOpen = useMemo(() => open.filter((x) => x.startTime && x.endTime), [open])
  const untimedOpen = useMemo(() => open.filter((x) => !(x.startTime && x.endTime)), [open])
  // 締切は焦らせてよい: 期限切れは畳まず、今日のリストの先頭に赤い日付つきで出す（今日を見ているときだけ）
  const overdue = useMemo(() => (viewingToday ? overdueAll : []), [viewingToday, overdueAll])
  // やり残し（前の日に置いて終わっていないもの）は今日を見ているときだけ、リストの上に 1 行で出してまとめて今日へ移せる
  const leftOver = useMemo(() => (viewingToday ? carryOver : []), [viewingToday, carryOver])
  const suggestions = dueSoon
  // 明日までが締切の To-Do は、畳んだ見出しの中に隠さない（今日やるかを決めるのに要る）
  const dueByTomorrow = viewingToday && dueSoon.some((x) => x.dueDate !== null && x.dueDate <= tomorrowKey)
  const showSuggestions = suggestionsChoice ?? dueByTomorrow
  const candidateView = useTaskStore((s) => s.plannerCandidateView)
  const { moreSuggestions, candidateGroups, hasMoreToShow, moreSentinelRef, shownSuggestions } = usePlannerSuggestions({
    tasks,
    dateKey,
    excludedListIds,
    suggestions,
    showSuggestions,
    view: candidateView,
  })
  const candidatePool = useMemo(() => [...suggestions, ...moreSuggestions], [suggestions, moreSuggestions])

  const dayHabits = useMemo(
    () => habits.filter((h) => isHabitScheduledOnDate(h, date)),
    // date は dateKey から毎回作り直すので key で依存を取る
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [habits, dateKey],
  )

  // 行のキー操作・選択・右クリックは To-Do 一覧と同じ（↑↓・Shift・⌘A・Enter・Space・Delete・⌘Enter・⌘/・Esc）。
  // 対象は開いている未完了の行を上から順に
  const rowIds = useMemo(
    () =>
      [
        ...overdue,
        ...(showLeftOver ? leftOver : []),
        ...untimedOpen,
        ...timedOpen,
        ...(showSuggestions ? candidateGroups.flatMap((g) => g.tasks) : []),
      ].map((x) => x.id),
    [showLeftOver, leftOver, overdue, untimedOpen, timedOpen, showSuggestions, candidateGroups],
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
  const wrapUpFrom = minutesOfClock(wrapUpTime) ?? WRAP_UP_FROM_HOUR * 60
  const showWrapUp =
    viewingToday &&
    (wrapUpFocus > 0 ||
      (totalCount > 0 && ((open.length === 0 && overdue.length === 0) || now.getHours() * 60 + now.getMinutes() >= wrapUpFrom)))
  // 気分の記号は締めの時刻から（To-Do が無い日・全部終えた日も。早い時刻に全部終えても夜まで待つ）。付けた日はそのまま出しておく
  const showMood = viewingToday && (wrapUpFocus > 0 || moodSet || now.getHours() * 60 + now.getMinutes() >= wrapUpFrom)

  // 候補の行は追加欄より下にあるので、listbox には aria-owns で入れる
  const idPrefix = useId()
  const suggestionGroupId = (group: CandidateGroup) => `${idPrefix}due-${group.kind === 'day' ? group.dueDate : group.kind}`
  const ownedGroupIds = showSuggestions ? candidateGroups.map(suggestionGroupId) : []

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
        />

        <PlannerTodoSection
          env={rowEnv}
          headingClass={sectionHeading}
          overdue={overdue}
          leftOver={leftOver}
          showLeftOver={showLeftOver}
          onToggleLeftOver={() => setShowLeftOver((v) => !v)}
          open={open}
          timedOpen={timedOpen}
          untimedOpen={untimedOpen}
          totalCount={totalCount}
          listboxProps={listboxProps}
          ownedGroupIds={ownedGroupIds}
        />

        {(suggestions.length > 0 || moreSuggestions.length > 0) && (
          <PlannerSuggestions
            env={rowEnv}
            addAllTargets={shownSuggestions}
            pool={candidatePool}
            candidateGroups={candidateGroups}
            open={showSuggestions}
            onToggle={() => setSuggestionsChoice(!showSuggestions)}
            hasMoreToShow={hasMoreToShow}
            moreSentinelRef={moreSentinelRef}
            groupId={suggestionGroupId}
          />
        )}

        {dayHabits.length > 0 && (
          <PlannerHabits dayHabits={dayHabits} dateKey={dateKey} viewingToday={viewingToday} headingClass={sectionHeading} />
        )}

        {done.length > 0 && (
          <div className="mt-6 px-3">
            <DisclosureButton tone="muted" open={showDone} onToggle={() => setShowDone((v) => !v)}>
              {t('planner.doneHeading', { count: done.length })}
            </DisclosureButton>
            {showDone && (
              <ul>
                {done.map((task) => (
                  <PlannerTaskRow key={task.id} task={task} env={rowEnv} />
                ))}
              </ul>
            )}
          </div>
        )}

        <PlannerWrapUp
          showWrapUp={showWrapUp}
          showMood={showMood}
          dateKey={dateKey}
          focusKey={wrapUpFocus}
          open={open}
          untaggedLogs={untaggedLogs}
          totalCount={totalCount}
          tomorrowKey={tomorrowKey}
          openDetail={openDetail}
        />
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
    </div>
  )
}
