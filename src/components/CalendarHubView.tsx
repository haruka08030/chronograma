import { useCallback, useState } from 'react'
import { addMonths, addWeeks, format, parseISO, startOfMonth, subMonths, subWeeks } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { CalendarView } from './CalendarView'
import { WeekCalendarView } from './WeekCalendarView'
import { GoogleConnectLine } from './GoogleConnectLine'
import { CalendarTaskDock } from './CalendarTaskDock'
import { CalendarDayPanel } from './CalendarDayPanel'
import { CalendarDateNav } from './CalendarDateNav'
import { Segmented } from './ui/Segmented'
import { useNavShortcut } from '../lib/shortcuts'
import { readDraggedTaskIds } from '../lib/useTimelineDrop'
import {
  setUnscheduleHover,
  UNSCHEDULE_DROP_ATTR,
  UNSCHEDULE_PATCH,
  useCalendarItemDrag,
} from '../lib/calendarItemDrag'
import { appToday } from '../lib/timeZone'
import { tip } from '../lib/tooltip'
import { acceptTaskDrag, DROP_HIGHLIGHT_CLASS } from '../lib/taskDrag'

export function CalendarHubView() {
  const { t } = useTranslation()
  const calendarMode = useTaskStore((s) => s.calendarMode)
  const setCalendarMode = useTaskStore((s) => s.setCalendarMode)
  const selectedDateKey = useTaskStore((s) => s.selectedCalendarDateKey)
  const setSelectedCalendarDateKey = useTaskStore((s) => s.setSelectedCalendarDateKey)
  // 右の日パネルと内容が重なり、グリッドを 4 割潰していたので既定は閉じる（「ToDo を表示」で開く）
  const [dockOpen, setDockOpen] = useState(false)
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(appToday()))
  const [weekAnchor, setWeekAnchor] = useState(() => appToday())

  const setMode = (mode: 'month' | 'week') => {
    setCalendarMode(mode)
    const d = parseISO(`${selectedDateKey}T12:00:00`)
    if (mode === 'month') setMonthCursor(startOfMonth(d))
    else setWeekAnchor(d)
  }

  const applyPickedDate = useCallback((key: string) => {
    setSelectedCalendarDateKey(key)
    const d = parseISO(`${key}T12:00:00`)
    setMonthCursor(startOfMonth(d))
    setWeekAnchor(d)
  }, [setSelectedCalendarDateKey])

  const onGoToday = useCallback(() => {
    const today = appToday()
    const key = format(today, 'yyyy-MM-dd')
    setSelectedCalendarDateKey(key)
    setMonthCursor(startOfMonth(today))
    setWeekAnchor(today)
  }, [setSelectedCalendarDateKey])

  const onPrevPeriod = useCallback(() => {
    if (calendarMode === 'month') {
      setMonthCursor((m) => subMonths(m, 1))
    } else {
      setWeekAnchor((w) => subWeeks(w, 1))
      setSelectedCalendarDateKey(format(subWeeks(parseISO(`${selectedDateKey}T12:00:00`), 1), 'yyyy-MM-dd'))
    }
  }, [calendarMode, selectedDateKey, setSelectedCalendarDateKey])

  const onNextPeriod = useCallback(() => {
    if (calendarMode === 'month') {
      setMonthCursor((m) => addMonths(m, 1))
    } else {
      setWeekAnchor((w) => addWeeks(w, 1))
      setSelectedCalendarDateKey(format(addWeeks(parseISO(`${selectedDateKey}T12:00:00`), 1), 'yyyy-MM-dd'))
    }
  }, [calendarMode, selectedDateKey, setSelectedCalendarDateKey])

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
        return !!task && !task.isTimeLog
      })
      asOneUndo(() => {
        for (const id of ids) updateTask(id, UNSCHEDULE_PATCH)
      })
    },
  }
  const unscheduleHighlight = itemDrag.overUnschedule
    ? DROP_HIGHLIGHT_CLASS
    : ''

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
        <div className="flex min-w-0 items-center gap-2">
          <Segmented
            role="tab"
            ariaLabel={t('calendarHub.calendarTabsAria')}
            value={calendarMode}
            onChange={setMode}
            options={[
              { value: 'month', label: t('common.month') },
              { value: 'week', label: t('common.week') },
            ]}
            className="shrink-0"
          />
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
      <GoogleConnectLine />

      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {calendarMode === 'month' ? (
              <CalendarView
                displayMonth={monthCursor}
                selectedDateKey={selectedDateKey}
                onSelectDate={applyPickedDate}
              />
            ) : (
              <WeekCalendarView
                anchor={weekAnchor}
                selectedDateKey={selectedDateKey}
                onSelectDate={applyPickedDate}
                onNavigateWeek={(dir) => (dir < 0 ? onPrevPeriod() : onNextPeriod())}
              />
            )}
          </div>
          {calendarMode === 'month' && (
            <div className="flex max-h-[22vh] min-h-[7rem] shrink-0 flex-col border-t border-zinc-200 dark:border-zinc-800 lg:hidden">
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
          ) : itemDrag.active && (
            <div
              {...unscheduleDropProps}
              className={`flex h-14 shrink-0 items-center justify-center border-t-2 border-dashed border-zinc-300 text-xs text-zinc-500 transition-colors
                dark:border-zinc-700 dark:text-zinc-400 ${unscheduleHighlight}`}
            >
              {t('calendarHub.dropToUnschedule')}
            </div>
          )}
        </div>
        <aside className="hidden h-full w-[360px] shrink-0 border-l border-zinc-200 dark:border-zinc-800 lg:block">
          <CalendarDayPanel selectedDateKey={selectedDateKey} />
        </aside>
      </div>
    </div>
  )
}
