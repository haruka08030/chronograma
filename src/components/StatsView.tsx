import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { format, subDays, isToday, startOfDay, startOfWeek, startOfMonth, parseISO, isSameDay } from 'date-fns'
import { enUS, ja } from 'date-fns/locale'
import { isListedTimeLog } from '../lib/timeLogTask'
import { isActiveTask } from '../lib/taskLifecycle'
import { displayListName } from '../lib/displayListName'
import type { Task } from '../types/task'
import { WeekReviewCard } from './WeekReviewCard'

function completionInstant(t: Task): string {
  return t.completedAt ?? t.updatedAt
}

export function StatsView() {
  const { t, i18n } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const lists = useTaskStore((s) => s.lists)

  const stats = useMemo(() => {
    const countedTasks = tasks.filter((t) => t.parentId === null && !isListedTimeLog(t) && isActiveTask(t))
    const completed = countedTasks.filter((t) => t.completed)
    const active = countedTasks.filter((t) => !t.completed)
    const today = startOfDay(new Date())
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
    const monthStart = startOfMonth(new Date())

    const completedToday = completed.filter((t) => {
      const d = new Date(completionInstant(t))
      return isSameDay(d, today)
    }).length

    const completedThisWeek = completed.filter((t) => {
      const d = new Date(completionInstant(t))
      return d >= weekStart
    }).length

    const completedThisMonth = completed.filter((t) => {
      const d = new Date(completionInstant(t))
      return d >= monthStart
    }).length

    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const day = subDays(today, 6 - i)
      const count = completed.filter((t) => isSameDay(new Date(completionInstant(t)), day)).length
      const locale = i18n.resolvedLanguage?.startsWith('ja') ? ja : enUS
      return { date: day, count, label: format(day, 'E', { locale }), dayNum: format(day, 'd') }
    })
    const maxDayCount = Math.max(1, ...last7Days.map((d) => d.count))

    const byPriority = { high: 0, medium: 0, low: 0, none: 0 }
    for (const t of active) {
      byPriority[t.priority]++
    }

    const byList = lists.map((l) => ({
      id: l.id,
      name: displayListName(l.id, l.name),
      color: l.color,
      active: active.filter((t) => t.listId === l.id).length,
      completed: completed.filter((t) => t.listId === l.id).length,
    })).filter((l) => l.active > 0 || l.completed > 0)

    const overdue = active.filter((t) => {
      if (!t.dueDate) return false
      const d = parseISO(t.dueDate)
      return d < today && !isToday(d)
    }).length

    let streak = 0
    for (let i = 0; i < 365; i++) {
      const day = subDays(today, i)
      const hasCompleted = completed.some((t) => isSameDay(new Date(completionInstant(t)), day))
      if (hasCompleted) streak++
      else break
    }

    return {
      totalActive: active.length,
      totalCompleted: completed.length,
      completedToday,
      completedThisWeek,
      completedThisMonth,
      last7Days,
      maxDayCount,
      byPriority,
      byList,
      overdue,
      streak,
    }
  }, [tasks, lists, i18n.resolvedLanguage])

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <div className="px-6 pt-8 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">{t('stats.title')}</h1>
        <p className="text-xs text-zinc-400 mt-1">{t('stats.subtitle')}</p>
      </div>

      <div className="px-6 pb-8 space-y-8">
        <WeekReviewCard />

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label={t('stats.completedToday')} value={stats.completedToday} accent />
          <StatCard label={t('stats.completedThisWeek')} value={stats.completedThisWeek} />
          <StatCard label={t('stats.completedThisMonth')} value={stats.completedThisMonth} />
          <StatCard label={t('stats.streakDays')} value={stats.streak} suffix={t('stats.daySuffix')} accent />
        </div>

        {/* Active vs completed */}
        <div className="grid grid-cols-3 gap-3">
          <MiniCard label={t('stats.active')} value={stats.totalActive} color="text-amber-500" />
          <MiniCard label={t('stats.done')} value={stats.totalCompleted} color="text-green-500" />
          <MiniCard label={t('stats.overdue')} value={stats.overdue} color="text-red-500" />
        </div>

        {/* 7-day chart */}
        <div>
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-4">{t('stats.chartTitle')}</h2>
          <div className="flex items-end gap-2 h-32">
            {stats.last7Days.map((d) => {
              const heightPct = (d.count / stats.maxDayCount) * 100
              const isCurrentDay = isToday(d.date)
              return (
                <div key={d.date.toISOString()} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[11px] text-zinc-500 font-medium">{d.count}</span>
                  <div className="w-full flex items-end" style={{ height: '80px' }}>
                    <div
                      className={`w-full rounded-t-md transition-all ${isCurrentDay ? 'bg-accent-500' : 'bg-accent-200 dark:bg-accent-500/30'}`}
                      style={{ height: `${Math.max(heightPct, 4)}%` }}
                    />
                  </div>
                  <span className={`text-[10px] ${isCurrentDay ? 'text-accent-600 dark:text-accent-400 font-semibold' : 'text-zinc-400'}`}>
                    {d.label}
                  </span>
                  <span className={`text-[10px] ${isCurrentDay ? 'text-accent-600 dark:text-accent-400' : 'text-zinc-400'}`}>
                    {d.dayNum}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Priority breakdown */}
        <div>
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">{t('stats.priorityTitle')}</h2>
          <div className="space-y-2">
            <PriorityBar label={t('common.high')} count={stats.byPriority.high} total={stats.totalActive} color="bg-red-500" />
            <PriorityBar label={t('common.medium')} count={stats.byPriority.medium} total={stats.totalActive} color="bg-amber-500" />
            <PriorityBar label={t('common.low')} count={stats.byPriority.low} total={stats.totalActive} color="bg-blue-500" />
            <PriorityBar label={t('common.none')} count={stats.byPriority.none} total={stats.totalActive} color="bg-zinc-300 dark:bg-zinc-600" />
          </div>
        </div>

        {/* List breakdown */}
        {stats.byList.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">{t('stats.byListTitle')}</h2>
            <div className="space-y-2">
              {stats.byList.map((l) => (
                <div key={l.id} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: l.color }} />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300 flex-1 truncate">{l.name}</span>
                  <span className="text-xs text-zinc-500 tabular-nums">{t('stats.listActive', { count: l.active })}</span>
                  <span className="text-xs text-green-500 tabular-nums">{t('stats.listCompleted', { count: l.completed })}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, suffix, accent }: { label: string; value: number; suffix?: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
      <p className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${accent ? 'text-accent-600 dark:text-accent-400' : 'text-zinc-900 dark:text-zinc-100'}`}>
        {value}{suffix}
      </p>
    </div>
  )
}

function MiniCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 text-center">
      <p className={`text-xl font-bold tabular-nums ${color}`}>{value}</p>
      <p className="text-[11px] text-zinc-400 mt-0.5">{label}</p>
    </div>
  )
}

function PriorityBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-zinc-500 w-6 text-right">{label}</span>
      <div className="flex-1 h-4 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%` }} />
      </div>
      <span className="text-xs text-zinc-500 w-6 tabular-nums">{count}</span>
    </div>
  )
}
