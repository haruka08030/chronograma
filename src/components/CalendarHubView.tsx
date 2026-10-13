import { useCallback, useState } from 'react'
import { addDays, addMonths, startOfMonth, subMonths } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { HINT_TEXT } from './ui/textClass'
import { useTaskStore } from '../store/taskStore'
import { CalendarView } from './CalendarView'
import { WeekCalendarView } from './WeekCalendarView'
import { GoogleConnectLine } from './GoogleConnectLine'
import { CalendarTaskDock } from './CalendarTaskDock'
import { CalendarDayPanel } from './CalendarDayPanel'
import { CalendarDateNav } from './CalendarDateNav'
import { CalendarScheduleView } from './CalendarScheduleView'
import { CalendarMobileHeader } from './CalendarMobileHeader'
import { Segmented } from './ui/Segmented'
import { useNavShortcut } from '../lib/shortcuts'
import { readDraggedTaskIds } from '../lib/useTimelineDrop'
import { setUnscheduleHover, UNSCHEDULE_DROP_ATTR, UNSCHEDULE_PATCH, useCalendarItemDrag } from '../lib/calendarItemDrag'
import { appToday } from '../lib/timeZone'
import { tip } from '../lib/tooltip'
import { acceptTaskDrag, DROP_HIGHLIGHT_CLASS } from '../lib/taskDrag'
import { fromDateKey, toDateKey } from '../lib/dateKey'
import { isTodoTask } from '../types/task'
import type { CalendarMode } from '../store/storeTypes'
import { useIsDesktop } from '../hooks/useMediaQuery'
import { useAppTodayKey } from '../hooks/useAppClock'
import { useEventTemplateStamp } from '../hooks/useEventTemplateStamp'
import { EventTemplateButton, EventTemplateStampBar } from './calendar/EventTemplateControls'
import { TimetableButton } from './calendar/TimetableButton'

export function CalendarHubView() {
  const { t } = useTranslation()
  const storedMode = useTaskStore((s) => s.calendarMode)
  const nothingYet = useTaskStore((s) => s.tasks.length === 0 && s.calendarEvents.length === 0)
  const setCalendarMode = useTaskStore((s) => s.setCalendarMode)
  const selectedDateKey = useTaskStore((s) => s.selectedCalendarDateKey)
  const setSelectedCalendarDateKey = useTaskStore((s) => s.setSelectedCalendarDateKey)
  // 右の日パネルと内容が重なり、グリッドを 4 割潰していたので既定は閉じる（「ToDo を表示」で開く）
  const [dockOpen, setDockOpen] = useState(false)
  // 開いたときは見ている日（今日の計画・習慣と共有）を含む月・週から
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(fromDateKey(selectedDateKey)))
  const [weekAnchor, setWeekAnchor] = useState(() => fromDateKey(selectedDateKey))
  // 開いたまま日をまたいだとき: 今日を見ていたなら（見ている日は useFollowToday が進める）週・月も新しい今日へ
  const todayKey = useAppTodayKey()
  const [seenTodayKey, setSeenTodayKey] = useState(todayKey)
  if (seenTodayKey !== todayKey) {
    setSeenTodayKey(todayKey)
    if (selectedDateKey === seenTodayKey || selectedDateKey === todayKey) {
      const today = fromDateKey(todayKey)
      setMonthCursor(startOfMonth(today))
      setWeekAnchor(today)
    }
  }
  const isDesktop = useIsDesktop()
  // 3 日表示はスマホ幅だけ。PC 幅では週にする
  const calendarMode: CalendarMode = isDesktop && storedMode === 'threeDay' ? 'week' : storedMode
  /** 週・3 日・スケジュールの表示で ‹ ›・スワイプ 1 回に進む日数（スマホ幅の週は 1 日だけ描くので 1 日ずつ） */
  const pageDays = calendarMode === 'threeDay' ? 3 : isDesktop || calendarMode === 'schedule' ? 7 : 1

  // よく入れる予定を選んで日を押している間（月表示だけ。ほかの表示に移ったら抜ける）
  const stamp = useEventTemplateStamp()
  if (stamp.template && calendarMode !== 'month') stamp.stop()
  // 月表示は「よく入れる予定」、週・3 日表示は「時間割」（授業を毎週の予定でまとめて入れる、#279）
  const templateButton =
    calendarMode === 'month' ? (
      <EventTemplateButton activeId={stamp.activeId} onPick={stamp.start} />
    ) : calendarMode === 'week' || calendarMode === 'threeDay' ? (
      <TimetableButton />
    ) : null

  const setMode = (mode: CalendarMode) => {
    setCalendarMode(mode)
    const d = fromDateKey(selectedDateKey)
    if (mode === 'month') setMonthCursor(startOfMonth(d))
    else setWeekAnchor(d)
  }

  const applyPickedDate = useCallback(
    (key: string) => {
      setSelectedCalendarDateKey(key)
      const d = fromDateKey(key)
      setMonthCursor(startOfMonth(d))
      setWeekAnchor(d)
    },
    [setSelectedCalendarDateKey],
  )

  /** スマホ幅の月のマスを押したとき: その日の 1 日表示へ */
  const openDay = useCallback(
    (key: string) => {
      setCalendarMode('week')
      applyPickedDate(key)
    },
    [setCalendarMode, applyPickedDate],
  )

  const onGoToday = useCallback(() => {
    const today = appToday()
    const key = toDateKey(today)
    setSelectedCalendarDateKey(key)
    setMonthCursor(startOfMonth(today))
    setWeekAnchor(today)
  }, [setSelectedCalendarDateKey])

  const stepPeriod = useCallback(
    (dir: -1 | 1) => {
      if (calendarMode === 'month') {
        setMonthCursor((m) => (dir < 0 ? subMonths(m, 1) : addMonths(m, 1)))
        return
      }
      const next = addDays(fromDateKey(selectedDateKey), dir * pageDays)
      setWeekAnchor(next)
      setSelectedCalendarDateKey(toDateKey(next))
    },
    [calendarMode, pageDays, selectedDateKey, setSelectedCalendarDateKey],
  )
  /** スマホの 1 日表示で上の曜日の帯を払ったとき: 同じ曜日のまま前後の週へ */
  const stepWeek = useCallback(
    (dir: -1 | 1) => {
      const next = addDays(fromDateKey(selectedDateKey), dir * 7)
      setWeekAnchor(next)
      setSelectedCalendarDateKey(toDateKey(next))
    },
    [selectedDateKey, setSelectedCalendarDateKey],
  )
  const onPrevPeriod = useCallback(() => stepPeriod(-1), [stepPeriod])
  const onNextPeriod = useCallback(() => stepPeriod(1), [stepPeriod])

  useNavShortcut({ today: onGoToday, prev: onPrevPeriod, next: onNextPeriod })

  // カレンダーの ToDo を下（ToDo 一覧 / 閉じているときの帯）に落とす = 日付と時刻をはずして ToDo に戻す
  const itemDrag = useCalendarItemDrag()
  const unscheduleDropProps = {
    [UNSCHEDULE_DROP_ATTR]: '',
    onDragOver: (e: React.DragEvent) => {
      if (!itemDrag.active || !acceptTaskDrag(e)) return
      setUnscheduleHover(true)
    },
    onDragLeave: (e: React.DragEvent) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
      setUnscheduleHover(false)
    },
    onDrop: (e: React.DragEvent) => {
      if (!itemDrag.active) return
      e.preventDefault()
      setUnscheduleHover(false)
      const { tasks, updateTask, asOneUndo } = useTaskStore.getState()
      const ids = readDraggedTaskIds(e.dataTransfer).filter((id) => {
        const task = tasks.find((x) => x.id === id)
        // 記録と予定は To-Do の置き場に戻さない
        return !!task && isTodoTask(task)
      })
      asOneUndo(() => {
        for (const id of ids) updateTask(id, UNSCHEDULE_PATCH)
      })
    },
  }
  const unscheduleHighlight = itemDrag.overUnschedule ? DROP_HIGHLIGHT_CLASS : ''

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      {isDesktop ? (
        <>
          <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
            <div className="flex min-w-0 items-center gap-2">
              <Segmented
                role="tab"
                ariaLabel={t('calendarHub.calendarTabsAria')}
                value={calendarMode}
                onChange={setMode}
                // スマホ幅は CalendarMobileHeader のメニュー（日 / 3日 / 月 / スケジュール）
                options={[
                  { value: 'month', label: t('common.month') },
                  { value: 'week', label: t('common.week') },
                  { value: 'schedule', label: t('calendarHub.modeSchedule') },
                ]}
                className="shrink-0"
              />
              {templateButton}
            </div>
            <button
              type="button"
              onClick={() => setDockOpen((o) => !o)}
              aria-pressed={dockOpen}
              {...tip(t('calendarHub.dockHint'))}
              // 右の「予定 / ToDo」とは別物（下に開く、時間が未定のタスク置き場）なので、中身の名前で出して開閉は押し込みで見せる
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                dockOpen
                  ? 'bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300'
                  : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
              }`}
            >
              {t('calendarHub.dockToggle')}
            </button>
          </div>

          <CalendarDateNav
            mode={calendarMode}
            selectedDateKey={selectedDateKey}
            monthCursor={monthCursor}
            weekAnchor={weekAnchor}
            onGoToday={onGoToday}
            onPrevPeriod={onPrevPeriod}
            onNextPeriod={onNextPeriod}
            onPickDate={applyPickedDate}
          />
        </>
      ) : (
        <CalendarMobileHeader
          mode={calendarMode}
          onModeChange={setMode}
          selectedDateKey={selectedDateKey}
          monthCursor={monthCursor}
          onGoToday={onGoToday}
          onPickDate={applyPickedDate}
          dockOpen={dockOpen}
          onToggleDock={() => setDockOpen((o) => !o)}
          extra={templateButton}
        />
      )}
      {/* スマホ幅で時間未定のタスクを開いている間は、未接続の案内を畳んで月の格子に場所を譲る */}
      <GoogleConnectLine hideInvite={dockOpen && !isDesktop} />
      {stamp.template && <EventTemplateStampBar template={stamp.template} onDone={stamp.stop} />}
      {/* まだ何も置いていない人には、どこを押せば入るかを 1 行だけ（＋ボタンの代わり。月とスケジュールは日を押して開く） */}
      {nothingYet && (calendarMode === 'week' || calendarMode === 'threeDay') && (
        <p className={`shrink-0 py-1 pl-4 pr-2 md:pl-6 ${HINT_TEXT}`}>{t('calendarHub.emptyHint')}</p>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {calendarMode === 'schedule' ? (
              <CalendarScheduleView startDateKey={selectedDateKey} onOpenDay={openDay} />
            ) : calendarMode === 'month' ? (
              <CalendarView
                displayMonth={monthCursor}
                selectedDateKey={selectedDateKey}
                onSelectDate={applyPickedDate}
                onOpenDay={isDesktop ? undefined : openDay}
                onSwipe={isDesktop ? undefined : stepPeriod}
                stamp={stamp.template ? { title: stamp.template.title, days: stamp.days, onDay: stamp.toggleDay } : undefined}
              />
            ) : (
              <WeekCalendarView
                anchor={weekAnchor}
                threeDay={calendarMode === 'threeDay'}
                selectedDateKey={selectedDateKey}
                // 3 日表示で日付を押したら、その日の 1 日表示へ（Google カレンダーと同じ）
                onSelectDate={calendarMode === 'threeDay' ? openDay : applyPickedDate}
                onNavigateWeek={stepPeriod}
                onNavigateStrip={stepWeek}
              />
            )}
          </div>
          {calendarMode === 'month' && !dockOpen && (
            // スマホ幅はマスを押すとその日を開くので、下の日のパネルは md〜lg だけ。
            // 時間未定のタスクを開いたら畳む（下に開く面は 1 つずつ。月の格子を潰さない）
            <div className="hidden max-h-[22vh] min-h-[7rem] shrink-0 flex-col border-t border-zinc-200 dark:border-zinc-800 md:flex lg:hidden">
              <CalendarDayPanel selectedDateKey={selectedDateKey} />
            </div>
          )}
          {dockOpen ? (
            <div
              {...unscheduleDropProps}
              className={`flex max-h-[28vh] min-h-[100px] w-full shrink-0 flex-col border-t border-zinc-200 dark:border-zinc-800 sm:max-h-[45vh] sm:min-h-[140px] sm:flex-[0_0_38%] ${unscheduleHighlight}`}
            >
              <CalendarTaskDock />
            </div>
          ) : (
            itemDrag.active &&
            !itemDrag.fromGrid && (
              <div
                {...unscheduleDropProps}
                className={`flex h-14 shrink-0 items-center justify-center border-t-2 border-dashed border-zinc-300 text-xs text-zinc-500 transition-colors
                dark:border-zinc-700 dark:text-zinc-400 ${unscheduleHighlight}`}
              >
                {t('calendarHub.dropToUnschedule')}
              </div>
            )
          )}
        </div>
        <aside className="hidden h-full w-[360px] shrink-0 border-l border-zinc-200 dark:border-zinc-800 lg:block">
          <CalendarDayPanel selectedDateKey={selectedDateKey} />
        </aside>
      </div>
    </div>
  )
}
