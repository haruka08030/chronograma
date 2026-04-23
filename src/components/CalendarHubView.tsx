import { useState } from 'react'
import { format } from 'date-fns'
import { useTaskStore } from '../store/taskStore'
import { CalendarView } from './CalendarView'
import { WeekCalendarView } from './WeekCalendarView'
import { CalendarTaskDock } from './CalendarTaskDock'
import { CalendarDayPanel } from './CalendarDayPanel'

export function CalendarHubView({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const calendarMode = useTaskStore((s) => s.calendarMode)
  const setCalendarMode = useTaskStore((s) => s.setCalendarMode)
  const [dockOpen, setDockOpen] = useState(true)
  const [selectedDateKey, setSelectedDateKey] = useState(() => format(new Date(), 'yyyy-MM-dd'))

  const setMode = (mode: 'month' | 'week') => setCalendarMode(mode)

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onOpenSidebar}
            className="shrink-0 rounded-lg p-2 -ml-1 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 md:hidden"
            aria-label="メニューを開く"
          >
            <svg className="h-5 w-5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          <div
            role="tablist"
            aria-label="カレンダー表示"
            className="inline-flex shrink-0 rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 dark:border-zinc-700 dark:bg-zinc-800"
          >
          <button
            type="button"
            role="tab"
            aria-selected={calendarMode === 'month'}
            onClick={() => setMode('month')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              calendarMode === 'month'
                ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            月
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={calendarMode === 'week'}
            onClick={() => setMode('week')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              calendarMode === 'week'
                ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            週
          </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDockOpen((o) => !o)}
          className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          {dockOpen ? 'ToDo を隠す' : 'ToDo を表示'}
        </button>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {calendarMode === 'month' ? (
              <CalendarView selectedDateKey={selectedDateKey} onSelectDate={setSelectedDateKey} />
            ) : (
              <WeekCalendarView selectedDateKey={selectedDateKey} onSelectDate={setSelectedDateKey} />
            )}
          </div>
          {dockOpen && (
            <div className="flex max-h-[45vh] min-h-[140px] w-full shrink-0 flex-col border-t border-zinc-200 dark:border-zinc-800 sm:flex-[0_0_38%]">
              <CalendarTaskDock />
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
