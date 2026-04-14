import { useState, useMemo, useRef, useEffect } from 'react'
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
} from 'date-fns'
import { ja } from 'date-fns/locale'
import { useTaskStore } from '../store/taskStore'
import { TaskDetail } from './TaskDetail'

const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日']

function InlineDayAdd({ dateKey, onDone }: { dateKey: string; onDone: () => void }) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  const addTaskWithDate = useTaskStore((s) => s.addTaskWithDate)

  useEffect(() => { ref.current?.focus() }, [])

  const submit = () => {
    const trimmed = value.trim()
    if (trimmed) addTaskWithDate(trimmed, dateKey)
    onDone()
  }

  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') submit()
        if (e.key === 'Escape') onDone()
      }}
      onBlur={submit}
      placeholder="タスク追加"
      className="w-full text-[10px] px-1.5 py-0.5 rounded bg-white dark:bg-zinc-800 border border-accent-400
                 outline-none text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
    />
  )
}

export function CalendarView() {
  const [current, setCurrent] = useState(new Date())
  const tasks = useTaskStore((s) => s.tasks)
  const [addingDate, setAddingDate] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)

  const days = useMemo(() => {
    const monthStart = startOfMonth(current)
    const monthEnd = endOfMonth(current)
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
    return eachDayOfInterval({ start: calStart, end: calEnd })
  }, [current])

  const tasksByDate = useMemo(() => {
    const map = new Map<string, typeof tasks>()
    for (const t of tasks) {
      if (!t.dueDate || t.parentId) continue
      const key = t.dueDate
      const arr = map.get(key) ?? []
      arr.push(t)
      map.set(key, arr)
    }
    return map
  }, [tasks])

  const detailTask = detailId ? tasks.find((t) => t.id === detailId) : null

  return (
    <>
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-8 pb-4">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            {format(current, 'yyyy年M月', { locale: ja })}
          </h1>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrent((c) => subMonths(c, 1))}
              className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <button
              onClick={() => setCurrent(new Date())}
              className="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800
                         text-zinc-600 dark:text-zinc-400 transition-colors"
            >
              今月
            </button>
            <button
              onClick={() => setCurrent((c) => addMonths(c, 1))}
              className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 px-4">
          {WEEKDAYS.map((d) => (
            <div key={d} className="text-center text-[11px] font-medium text-zinc-400 dark:text-zinc-500 py-2">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 px-4 pb-4 flex-1">
          {days.map((day) => {
            const key = format(day, 'yyyy-MM-dd')
            const dayTasks = tasksByDate.get(key) ?? []
            const inMonth = isSameMonth(day, current)
            const today = isToday(day)

            return (
              <div
                key={key}
                className={`min-h-[80px] border-t border-zinc-100 dark:border-zinc-800 p-1.5 cursor-pointer
                            hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors
                            ${!inMonth ? 'opacity-30' : ''}`}
                onClick={() => setAddingDate(key)}
              >
                <div className={`text-xs mb-1 w-6 h-6 flex items-center justify-center rounded-full
                  ${today
                    ? 'bg-accent-500 text-white font-semibold'
                    : 'text-zinc-500 dark:text-zinc-400'}`}
                >
                  {format(day, 'd')}
                </div>
                <div className="space-y-0.5">
                  {dayTasks.slice(0, 3).map((t) => (
                    <div
                      key={t.id}
                      onClick={(e) => { e.stopPropagation(); setDetailId(t.id) }}
                      className={`text-[10px] leading-tight px-1.5 py-0.5 rounded truncate cursor-pointer
                        hover:ring-1 hover:ring-accent-400 transition-all
                        ${t.completed
                          ? 'line-through text-zinc-400 dark:text-zinc-600'
                          : 'bg-accent-50 dark:bg-accent-500/10 text-accent-700 dark:text-accent-300'}`}
                    >
                      {t.startTime && (
                        <span className="text-[9px] opacity-60 mr-0.5">{t.startTime}</span>
                      )}
                      {t.title}
                    </div>
                  ))}
                  {dayTasks.length > 3 && (
                    <div className="text-[10px] text-zinc-400 px-1.5">
                      +{dayTasks.length - 3}
                    </div>
                  )}
                  {addingDate === key && (
                    <InlineDayAdd dateKey={key} onDone={() => setAddingDate(null)} />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {detailTask && (
        <TaskDetail task={detailTask} onClose={() => setDetailId(null)} />
      )}
    </>
  )
}
