import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { OverlaySuspense } from './ui/OverlaySuspense'
import { useTranslation } from 'react-i18next'
import { parseISO } from 'date-fns'
import { unplannedListIds } from '../lib/listKind'
import { useTaskStore } from '../store/taskStore'
import { useShownCalendarEvents } from '../hooks/useShownCalendarEvents'
import { TaskItem } from './TaskItem'
import { formatDuration, timeToMinutes } from '../lib/timeGrid'
import { logOverlapsDateKey, minutesOfLogOnCalendarDay, taskPlacementDate } from '../lib/taskTimeRange'
import { isActiveTask } from '../lib/taskLifecycle'
import { colorVars, recordHex } from '../lib/logCategoryColors'
import { DEFAULT_GOOGLE_EVENT_HEX } from '../lib/googleColors'
import { CalendarAddTaskButton, CalendarInlineTaskAdd } from './CalendarInlineTaskAdd'
import { readDraggedTaskIds } from '../lib/useTimelineDrop'
import { isLogTask, isSleepTask, type Task } from '../types/task'
import { completionDayKey, dueMarkDayKey } from '../lib/dayPlan'
import { appTodayKey, isAppToday } from '../lib/timeZone'
import { Segmented } from './ui/Segmented'
import { acceptTaskDrag, DROP_HIGHLIGHT_CLASS } from '../lib/taskDrag'
import { EmptyState } from './ui/EmptyState'
import { CalendarIcon, ClockIcon } from './icons'
import { useDateFormat } from '../hooks/useDateFormat'
import { useHolidayName } from '../hooks/useHolidayName'
import { DayRow } from './ui/DayRow'
import { DisclosureButton } from './ui/Disclosure'
import type { CalendarEvent } from '../types/calendarEvent'
import { openCalendarItemMenu, openTaskMenu } from '../lib/overlays'
import { useCalendarCards } from '../hooks/useCalendarCards'
import { CalendarCards } from './calendar/CalendarCards'
import { TaskDueMark } from './calendar/TaskDueMark'
import { useTouchContextMenu } from '../hooks/useTouchContextMenu'
import { useNow } from '../hooks/useAppClock'
import { googleEventVisualState, planDotClass, planDotHex, planVisualState } from '../lib/planVisual'
import { META_TEXT } from './ui/textClass'
import { compareByOrder } from '../lib/orderCompare'

type DayPanelTab = 'planned' | 'log'

type PlannedRow = { kind: 'task'; task: Task } | { kind: 'google'; event: CalendarEvent }

/** 時刻のある行の開始（並べ替え用。時刻の無い行は並べる前に分けてある） */
const rowStart = (row: PlannedRow) => (row.kind === 'task' ? row.task.startTime : row.event.startTime) ?? '00:00'

/** 睡眠の記録の丸（タイムラインの睡眠の帯と同じ色） */
const SLEEP_DOT_STYLE = { '--c': 'var(--color-sleep)' } as CSSProperties

export function CalendarDayPanel({ selectedDateKey }: { selectedDateKey: string }) {
  const { t } = useTranslation()
  // To‑Do の一覧と同じく、時間を決めた予定の ✓ は「完了＋記録」
  const tasks = useTaskStore((s) => s.tasks)
  // やらなかった予定（#528）も薄く出す
  const calendarEvents = useShownCalendarEvents()
  // 過ぎた日はやったこと（記録）が主役なので記録から開く。日を変えたら既定に戻す
  const defaultTab: DayPanelTab = selectedDateKey < appTodayKey() ? 'log' : 'planned'
  const [tabChoice, setTabChoice] = useState<{ dateKey: string; tab: DayPanelTab } | null>(null)
  const tab = tabChoice?.dateKey === selectedDateKey ? tabChoice.tab : defaultTab
  const setTab = (next: DayPanelTab) => setTabChoice({ dateKey: selectedDateKey, tab: next })
  // 押すと小さなカード（月・週・スケジュールと同じ）
  const cards = useCalendarCards()
  const rootRef = useRef<HTMLDivElement>(null)
  // タッチは行の長押しで右クリックと同じメニュー（月・週・スケジュールと同じ）
  useTouchContextMenu(rootRef, (target) => !target.closest('[data-touch-menu],[data-task-row]'))
  // 予定が終わったら灰色にするので、分の境目で描き直す
  const now = useNow()
  const logCategoryColors = useTaskStore((s) => s.logCategoryColors)
  const [adding, setAdding] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const updateTask = useTaskStore((s) => s.updateTask)
  const asOneUndo = useTaskStore((s) => s.asOneUndo)
  const df = useDateFormat()

  const holiday = useHolidayName()(selectedDateKey)
  const date = parseISO(`${selectedDateKey}T00:00:00`)
  // 「10月12日 (月) · 今日 · スポーツの日」（祝日は名前を添えるだけ）
  const dateLabel = [df.monthDayWeekday(selectedDateKey), isAppToday(date) ? t('activityLog.today') : null, holiday]
    .filter(Boolean)
    .join(' · ')

  const lists = useTaskStore((s) => s.lists)
  // いつか・チェックリストは日付があってもカレンダーの予定として出さない
  const excludedListIds = useMemo(() => unplannedListIds(lists), [lists])
  const plannedItems = useMemo(
    () =>
      tasks
        .filter(
          (t) =>
            taskPlacementDate(t) === selectedDateKey &&
            !t.parentId &&
            !isLogTask(t) &&
            !t.completed &&
            isActiveTask(t) &&
            !excludedListIds.has(t.listId),
        )
        .sort((a, b) => {
          if (!a.startTime && b.startTime) return -1
          if (a.startTime && !b.startTime) return 1
          if (a.startTime && b.startTime) {
            return timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
          }
          return compareByOrder(a, b)
        }),
    [tasks, selectedDateKey, excludedListIds],
  )
  const externalEvents = useMemo(
    () =>
      calendarEvents
        .filter((e) => e.date === selectedDateKey)
        .sort((a, b) => {
          if (!a.startTime && b.startTime) return -1
          if (a.startTime && !b.startTime) return 1
          if (a.startTime && b.startTime) {
            return timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
          }
          return a.summary.localeCompare(b.summary)
        }),
    [calendarEvents, selectedDateKey],
  )

  const plannedRows = useMemo<PlannedRow[]>(() => {
    const untimed = plannedItems.filter((x) => !x.startTime).map((task): PlannedRow => ({ kind: 'task', task }))
    const allDay = externalEvents.filter((e) => !e.startTime).map((event): PlannedRow => ({ kind: 'google', event }))
    const timed = [
      ...plannedItems.filter((x) => x.startTime).map((task): PlannedRow => ({ kind: 'task', task })),
      ...externalEvents.filter((e) => e.startTime).map((event): PlannedRow => ({ kind: 'google', event })),
    ].sort((a, b) => timeToMinutes(rowStart(a)) - timeToMinutes(rowStart(b)))
    return [...untimed, ...allDay, ...timed]
  }, [plannedItems, externalEvents])

  /** 締切の日の印（実行日が別の日の未完了。月・週・スケジュールと同じ） */
  const dueItems = useMemo(
    () =>
      tasks.filter(
        (t) => !t.parentId && !isLogTask(t) && isActiveTask(t) && !excludedListIds.has(t.listId) && dueMarkDayKey(t) === selectedDateKey,
      ),
    [tasks, selectedDateKey, excludedListIds],
  )

  const executedItems = useMemo(
    () =>
      tasks
        .filter(
          (t) =>
            !t.parentId &&
            !isLogTask(t) &&
            t.completed &&
            isActiveTask(t) &&
            !excludedListIds.has(t.listId) &&
            completionDayKey(t) === selectedDateKey,
        )
        .sort((a, b) => {
          const ta = new Date(a.completedAt ?? a.updatedAt).getTime()
          const tb = new Date(b.completedAt ?? b.updatedAt).getTime()
          return tb - ta
        }),
    [tasks, selectedDateKey, excludedListIds],
  )

  const logItems = useMemo(
    () =>
      tasks
        .filter((t) => !t.parentId && isLogTask(t) && isActiveTask(t) && logOverlapsDateKey(t, selectedDateKey))
        .sort((a, b) => {
          if (!a.startTime || !b.startTime) return compareByOrder(a, b)
          return timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
        }),
    [tasks, selectedDateKey],
  )

  const totalLoggedMinutes = useMemo(
    () => logItems.reduce((acc, item) => (isSleepTask(item) ? acc : acc + minutesOfLogOnCalendarDay(item, selectedDateKey)), 0),
    [logItems, selectedDateKey],
  )

  return (
    <div ref={rootRef} className="flex h-full min-h-0 min-w-0 flex-1 flex-row">
      <div
        className={`flex h-full min-h-0 min-w-0 flex-1 flex-col transition-colors ${
          dragOver ? DROP_HIGHLIGHT_CLASS : 'bg-zinc-50/70 dark:bg-zinc-900/70'
        }`}
        onDragOver={(e) => {
          if (acceptTaskDrag(e)) setDragOver(true)
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
          setDragOver(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const ids = readDraggedTaskIds(e.dataTransfer)
          const all = useTaskStore.getState().tasks
          const moving = ids
            .map((id) => all.find((x) => x.id === id))
            .filter((x): x is Task => !!x && !isLogTask(x) && taskPlacementDate(x) !== selectedDateKey)
          if (!moving.length) return
          // この日の予定に入れる（時刻があれば保つ。期限 dueDate は変えない）
          asOneUndo(() => {
            for (const x of moving) updateTask(x.id, { scheduledDate: selectedDateKey })
          })
          setTab('planned')
        }}
      >
        <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="flex items-center justify-between gap-2">
            <h2 className="min-w-0 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{dateLabel}</h2>
            {tab === 'planned' && !adding && (
              <CalendarAddTaskButton onClick={() => setAdding(true)} className="h-6 w-6 shrink-0 p-1 opacity-70 hover:opacity-100" />
            )}
          </div>
          {tab === 'planned' && adding && (
            <div className="mt-2">
              <CalendarInlineTaskAdd dateKey={selectedDateKey} size="md" onDone={() => setAdding(false)} />
            </div>
          )}
        </div>

        <div className="px-4 pt-3">
          <Segmented
            role="tab"
            ariaLabel={t('calendarDayPanel.tabsAria')}
            value={tab}
            onChange={setTab}
            options={[
              { value: 'planned', label: t('calendarDayPanel.plannedTab') },
              { value: 'log', label: t('common.log') },
            ]}
          />
        </div>

        {tab === 'planned' ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 pt-3">
            {plannedRows.length === 0 && executedItems.length === 0 && dueItems.length === 0 ? (
              <EmptyState size="sm" icon={<CalendarIcon strokeWidth={1} />} title={t('calendarDayPanel.noPlanned')} />
            ) : (
              <>
                {/* 1 件 1 行。時刻の無い To-Do → 終日 → 時刻順（右のタイムラインに箱があるので、ここは流し読みの一覧） */}
                {plannedRows.map((row) =>
                  row.kind === 'task' ? (
                    // 月・週・スケジュールと同じく、押すと小さなカード、右クリック・長押しで予定は予定のメニュー・To-Do は To-Do のメニュー
                    <TaskItem
                      key={row.task.id}
                      task={row.task}
                      compact
                      dayKey={selectedDateKey}
                      hideDueDatePicker
                      calendarState={planVisualState(row.task, selectedDateKey, now)}
                      onMenu={(p) => openCalendarItemMenu(row.task, p.clientX, p.clientY)}
                      onRowClick={(e) => cards.openCard(row.task.id, e.currentTarget)}
                    />
                  ) : (
                    (() => {
                      // 色は予定ごと（無ければ Google の既定の色）。時間が過ぎたら灰色
                      const state = googleEventVisualState(row.event, selectedDateKey, now)
                      const hex = row.event.color ?? DEFAULT_GOOGLE_EVENT_HEX
                      return (
                        <DayRow
                          key={row.event.id}
                          time={row.event.startTime ?? t('weekCalendar.allDay')}
                          dotStyle={colorVars(planDotHex(state, hex))}
                          dotClass={planDotClass(state, hex)}
                          passed={state !== 'upcoming'}
                          title={row.event.summary}
                          skipped={row.event.skipped}
                          onClick={(e) => cards.openGoogleCard(row.event.id, e.currentTarget)}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            openTaskMenu({ kind: 'google', x: e.clientX, y: e.clientY, eventId: row.event.id })
                          }}
                        />
                      )
                    })()
                  ),
                )}
                {dueItems.map((task) => (
                  <TaskDueMark key={`due-${task.id}`} task={task} dateKey={selectedDateKey} size="sm" onOpen={cards.openCard} />
                ))}
                {executedItems.length > 0 && (
                  // 済んだものは数だけ。押すと開く
                  <div className={plannedRows.length > 0 || dueItems.length > 0 ? 'mt-2' : ''}>
                    <DisclosureButton tone="muted" open={showDone} onToggle={() => setShowDone((v) => !v)}>
                      {t('calendarDayPanel.executedSection', { count: executedItems.length })}
                    </DisclosureButton>
                    {showDone &&
                      executedItems.map((task) => (
                        <TaskItem
                          key={task.id}
                          task={task}
                          compact
                          dayKey={selectedDateKey}
                          hideDueDatePicker
                          calendarState="done"
                          onMenu={(p) => openCalendarItemMenu(task, p.clientX, p.clientY)}
                          onRowClick={(e) => cards.openCard(task.id, e.currentTarget)}
                        />
                      ))}
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 pt-3">
            {logItems.length === 0 ? (
              <EmptyState size="sm" icon={<ClockIcon strokeWidth={1} />} title={t('calendarDayPanel.noLogs')} />
            ) : (
              <>
                {totalLoggedMinutes > 0 && (
                  <p className={`mb-1 px-2.5 ${META_TEXT}`}>
                    {t('calendarDayPanel.totalLogged')}{' '}
                    <span className="font-medium tabular-nums text-zinc-700 dark:text-zinc-300">{formatDuration(totalLoggedMinutes)}</span>
                  </p>
                )}
                {logItems.map((item) => (
                  // 予定と同じ 1 行。色はラベルの色（睡眠は睡眠の色）、右に長さ
                  <DayRow
                    key={item.id}
                    time={item.startTime}
                    dotStyle={isSleepTask(item) ? SLEEP_DOT_STYLE : colorVars(recordHex(item, logCategoryColors))}
                    title={item.title}
                    // 記録は記録のメニュー（色＝ラベル・編集・削除）。睡眠は色を持たないのでカードだけ
                    onContextMenu={
                      isSleepTask(item)
                        ? undefined
                        : (e) => {
                            e.preventDefault()
                            openCalendarItemMenu(item, e.clientX, e.clientY)
                          }
                    }
                    trailing={
                      <span className={`shrink-0 tabular-nums ${META_TEXT}`}>
                        {formatDuration(minutesOfLogOnCalendarDay(item, selectedDateKey))}
                      </span>
                    }
                    onClick={(e) => cards.openCard(item.id, e.currentTarget)}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </div>
      <OverlaySuspense>
        <CalendarCards cards={cards} />
      </OverlaySuspense>
    </div>
  )
}
