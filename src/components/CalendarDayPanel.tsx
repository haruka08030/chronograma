import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { parseISO } from 'date-fns'
import { unplannedListIds } from '../lib/listKind'
import { useTaskStore } from '../store/taskStore'
import { TaskItem } from './TaskItem'
import { formatDuration, timeToMinutes } from '../lib/timeGrid'
import { isOvernightTimeLog, logOverlapsDateKey, minutesOfLogOnCalendarDay, taskPlacementDate } from '../lib/taskTimeRange'
import { isActiveTask } from '../lib/taskLifecycle'
import { colorVars, recordHex } from '../lib/logCategoryColors'
import { DEFAULT_GOOGLE_EVENT_HEX } from '../lib/googleColors'
import { CalendarAddTaskButton, CalendarInlineTaskAdd } from './CalendarInlineTaskAdd'
import { readDraggedTaskIds } from '../lib/useTimelineDrop'
import { isLogTask, isSleepTask, type Task } from '../types/task'
import { completionDayKey } from '../lib/dayPlan'
import { appTodayKey, isAppToday } from '../lib/timeZone'
import { Segmented } from './ui/Segmented'
import { acceptTaskDrag, DROP_HIGHLIGHT_CLASS } from '../lib/taskDrag'
import { EmptyState } from './ui/EmptyState'
import { CalendarIcon, ClockIcon } from './icons'
import { useDateFormat } from '../hooks/useDateFormat'
import { SectionLabel } from './ui/SectionLabel'
import { openTaskDetail, openTaskMenu } from '../lib/overlays'
import { GoogleEventPopover } from './timeline/GoogleEventPopover'
import { rectOf, type AnchorRect } from './timeline/anchoredCard'
import { META_TEXT } from './ui/textClass'

type DayPanelTab = 'planned' | 'log'

export function CalendarDayPanel({
  selectedDateKey,
}: {
  selectedDateKey: string
}) {
  const { t } = useTranslation()
  // To‑Do の一覧と同じく、時間を決めた予定の ✓ は「完了＋記録」
  const tasks = useTaskStore((s) => s.tasks)
  const calendarEvents = useTaskStore((s) => s.calendarEvents)
  // 過ぎた日はやったこと（記録）が主役なので記録から開く。日を変えたら既定に戻す
  const defaultTab: DayPanelTab = selectedDateKey < appTodayKey() ? 'log' : 'planned'
  const [tabChoice, setTabChoice] = useState<{ dateKey: string; tab: DayPanelTab } | null>(null)
  const tab = tabChoice?.dateKey === selectedDateKey ? tabChoice.tab : defaultTab
  const setTab = (next: DayPanelTab) => setTabChoice({ dateKey: selectedDateKey, tab: next })
  const [googleCard, setGoogleCard] = useState<{ eventId: string; anchor: AnchorRect } | null>(null)
  const logCategoryColors = useTaskStore((s) => s.logCategoryColors)
  const [adding, setAdding] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const updateTask = useTaskStore((s) => s.updateTask)
  const asOneUndo = useTaskStore((s) => s.asOneUndo)
  const openDetail = openTaskDetail
  const df = useDateFormat()

  const date = parseISO(`${selectedDateKey}T00:00:00`)
  const dateLabel = isAppToday(date)
    ? `${df.monthDayWeekday(selectedDateKey)} · ${t('activityLog.today')}`
    : df.monthDayWeekday(selectedDateKey)

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
          return a.order - b.order
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
          if (!a.startTime || !b.startTime) return a.order - b.order
          return timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
        }),
    [tasks, selectedDateKey],
  )

  const totalLoggedMinutes = useMemo(
    () =>
      logItems.reduce((acc, item) => (isSleepTask(item) ? acc : acc + minutesOfLogOnCalendarDay(item, selectedDateKey)), 0),
    [logItems, selectedDateKey],
  )

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-row">
      <div
        className={`flex h-full min-h-0 min-w-0 flex-1 flex-col transition-colors ${
          dragOver
            ? DROP_HIGHLIGHT_CLASS
            : 'bg-zinc-50/70 dark:bg-zinc-900/70'
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
              <CalendarAddTaskButton
                onClick={() => setAdding(true)}
                className="h-6 w-6 shrink-0 p-1 opacity-70 hover:opacity-100"
              />
            )}
          </div>
          {tab === 'planned' && adding && (
            <div className="mt-2">
              <CalendarInlineTaskAdd
                dateKey={selectedDateKey}
                size="md"
                onDone={() => setAdding(false)}
              />
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
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 pt-3">
              {externalEvents.length === 0 && plannedItems.length === 0 && executedItems.length === 0 ? (
                <EmptyState size="sm" icon={<CalendarIcon strokeWidth={1} />} title={t('calendarDayPanel.noPlanned')} />
              ) : (
                <>
                  {externalEvents.length > 0 && (
                    <div className="mb-2 space-y-1.5 px-2">
                      {/* カレンダー本体と同じく、色は予定ごと（無ければ Google の既定の色） */}
                      {externalEvents.map((event) => (
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
                    </div>
                  )}
                  {plannedItems.map((task) => (
                    <TaskItem key={task.id} task={task} hideDueDatePicker onRowClick={() => openDetail(task.id)} />
                  ))}
                  {executedItems.length > 0 && (
                    <div className={`${externalEvents.length > 0 || plannedItems.length > 0 ? 'mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-700' : ''}`}>
                      <SectionLabel as="p" className="mb-2 px-2">
                        {t('calendarDayPanel.executedSection', { count: executedItems.length })}
                      </SectionLabel>
                      {executedItems.map((task) => (
                        <TaskItem key={task.id} task={task} hideDueDatePicker onRowClick={() => openDetail(task.id)} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-3">
            {logItems.length === 0 ? (
              <EmptyState size="sm" icon={<ClockIcon strokeWidth={1} />} title={t('calendarDayPanel.noLogs')} />
            ) : (
              <>
                {totalLoggedMinutes > 0 && (
                  <p className={`mb-2 px-1 ${META_TEXT}`}>
                    {t('calendarDayPanel.totalLogged')}{' '}<span className="font-medium tabular-nums text-zinc-700 dark:text-zinc-300">{formatDuration(totalLoggedMinutes)}</span>
                  </p>
                )}
              <div className="space-y-1.5">
                {logItems.map((item) => (
                  // タイムラインの記録と同じく、ラベルの色の薄い塗り＋枠（睡眠は睡眠の色）
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openDetail(item.id)}
                    className={`${isSleepTask(item) ? 'gc-sleep' : 'gc-plan'} block w-full rounded-lg px-3 py-2 text-left`}
                    style={colorVars(recordHex(item, logCategoryColors))}
                  >
                    <div className="truncate text-sm font-medium">{item.title}</div>
                    <div className="mt-0.5 text-xs opacity-70">
                      {item.startTime && item.endTime
                        ? `${item.startTime} – ${item.endTime}${
                            isOvernightTimeLog(item) ? ` (${t('activityLog.spansNextDay', { time: item.endTime })})` : ''
                          }`
                        : t('calendarDayPanel.timeUnset')}
                    </div>
                  </button>
                ))}
              </div>
              </>
            )}
          </div>
        )}
      </div>
      {googleCard && <GoogleEventPopover eventId={googleCard.eventId} anchor={googleCard.anchor} onClose={() => setGoogleCard(null)} />}
    </div>
  )
}
