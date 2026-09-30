import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { format, subDays, isToday, startOfDay, startOfWeek, startOfMonth, parseISO, isSameDay } from 'date-fns'
import { enUS, ja } from 'date-fns/locale'
import { isListedTimeLog } from '../lib/timeLogTask'
import { isActiveTask } from '../lib/taskLifecycle'
import { displayListName } from '../lib/displayListName'
import { unplannedListIds } from '../lib/listKind'
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
    // 買い物のチェックや Wish で数字が膨らまないよう、やることリストのタスクだけを数える
    const excluded = unplannedListIds(lists)
    const countedTasks = tasks.filter(
      (t) => t.parentId === null && !isListedTimeLog(t) && isActiveTask(t) && !excluded.has(t.listId),
    )
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

    const byList = lists.filter((l) => !excluded.has(l.id)).map((l) => ({
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

        {/* タスク: ふりかえりと重複しない数字だけを 1 行に */}
        <section>
          <h2 className="mb-2 px-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{t('stats.tasksTitle')}</h2>
          <dl className="grid grid-cols-2 divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-4 sm:divide-x">
            {[
              { label: t('stats.completedThisMonth'), value: stats.completedThisMonth },
              { label: t('stats.activeLabel'), value: stats.totalActive },
              { label: t('stats.overdueLabel'), value: stats.overdue, warn: stats.overdue > 0 },
              { label: t('stats.streakLabel'), value: stats.streak, suffix: t('stats.daySuffix') },
            ].map((x) => (
              <div key={x.label} className="px-4 py-3">
                <dt className="text-[11px] text-zinc-500 dark:text-zinc-400">{x.label}</dt>
                <dd className={`mt-0.5 text-xl font-semibold tabular-nums ${x.warn ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-900 dark:text-zinc-100'}`}>
                  {x.value}
                  {x.suffix && <span className="ml-0.5 text-sm font-normal text-zinc-500">{x.suffix}</span>}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {stats.byList.length > 0 && (
          <section>
            <h2 className="mb-2 px-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{t('stats.byListTitle')}</h2>
            <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
              {stats.byList.map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: l.color }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm text-zinc-700 dark:text-zinc-300">{l.name}</span>
                  <span className="text-xs tabular-nums text-zinc-500">{t('stats.listActive', { count: l.active })}</span>
                  <span className="text-xs tabular-nums text-zinc-400">{t('stats.listCompleted', { count: l.completed })}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}

