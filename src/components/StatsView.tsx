import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { WeekReviewCard } from './WeekReviewCard'
import { SleepStatsCard } from './SleepStatsCard'
import { computeTaskStats } from '../lib/taskStats'
import { CARD_TITLE_CLASS, PAGE_TITLE_CLASS } from './ui/headingClass'
import { PAGE_SCROLL_CLASS } from './ui/layoutClass'
import { META_TEXT } from './ui/textClass'
import { DUE_TONE_CLASS } from './ui/dueTone'
import { useAppTodayKey } from '../hooks/useAppClock'

export function StatsView() {
  const { t } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const lists = useTaskStore((s) => s.lists)

  // 日をまたいだら数え直す（今日の日付を依存に入れる）
  const todayKey = useAppTodayKey()
  const stats = useMemo(() => computeTaskStats(tasks, lists, todayKey), [tasks, lists, todayKey])

  return (
    <div className={`flex flex-col ${PAGE_SCROLL_CLASS}`}>
      <div className="px-4 pt-4 pb-3 md:px-6 md:pt-8 md:pb-4">
        <h1 className={PAGE_TITLE_CLASS}>{t('stats.title')}</h1>
      </div>

      <div className="px-4 pb-8 space-y-8 md:px-6">
        <WeekReviewCard />
        <SleepStatsCard />

        {/* タスク: ふりかえりと重複しない数字だけを 1 行に（今月の完了は月のふりかえりの「完了したタスク」で見る） */}
        <section>
          <h2 className={`mb-2 px-1 ${CARD_TITLE_CLASS}`}>{t('stats.tasksTitle')}</h2>
          <dl className="grid grid-cols-3 divide-x divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {[
              { label: t('stats.activeLabel'), value: stats.totalActive },
              { label: t('stats.overdueLabel'), value: stats.overdue, warn: stats.overdue > 0 },
              { label: t('stats.streakLabel'), value: stats.streak, suffix: t('stats.daySuffix') },
            ].map((x) => (
              <div key={x.label} className="px-4 py-3">
                <dt className="text-[11px] text-zinc-500 dark:text-zinc-400">{x.label}</dt>
                <dd
                  className={`mt-0.5 text-xl font-semibold tabular-nums ${x.warn ? DUE_TONE_CLASS.overdue : 'text-zinc-900 dark:text-zinc-100'}`}
                >
                  {x.value}
                  {x.suffix && <span className="ml-0.5 text-sm font-normal text-zinc-500">{x.suffix}</span>}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* タグが 1 つも無ければ「タグ無し 1 行」になるだけなので出さない */}
        {stats.byTag.some((x) => x.tag !== '') && (
          <section>
            <h2 className={`mb-2 px-1 ${CARD_TITLE_CLASS}`}>{t('stats.byTagTitle')}</h2>
            <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
              {stats.byTag.map((x) => (
                <li key={x.tag} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm text-zinc-700 dark:text-zinc-300">{x.tag || t('tags.untagged')}</span>
                  <span className={`tabular-nums ${META_TEXT}`}>{t('stats.listActive', { count: x.active })}</span>
                  <span className={`tabular-nums ${META_TEXT}`}>{t('stats.listCompleted', { count: x.completed })}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
