import { useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { WeekReviewCard } from './WeekReviewCard'
import { SleepStatsCard } from './SleepStatsCard'
import { computeTagStats } from '../lib/taskStats'
import { CARD_TITLE_CLASS, PAGE_TITLE_CLASS } from './ui/headingClass'
import { PAGE_SCROLL_CLASS } from './ui/layoutClass'
import { useRememberScroll } from '../hooks/useRememberScroll'
import { META_TEXT } from './ui/textClass'

export function StatsView() {
  const { t } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const lists = useTaskStore((s) => s.lists)

  // To-Do の未完了・締切切れは選ぶ前の数なので To-Do の画面で見る。ここ（決めた後に見る）はタグ別だけ。
  // 今月の完了は月のふりかえりの「完了したタスク」で見る
  const stats = useMemo(() => computeTagStats(tasks, lists), [tasks, lists])
  const scrollRef = useRef<HTMLDivElement>(null)
  useRememberScroll(scrollRef, 'stats')

  return (
    <div ref={scrollRef} className={`flex flex-col ${PAGE_SCROLL_CLASS}`}>
      <div className="px-4 pt-4 pb-3 md:px-6 md:pt-8 md:pb-4">
        <h1 className={PAGE_TITLE_CLASS}>{t('stats.title')}</h1>
      </div>

      <div className="px-4 pb-8 space-y-8 md:px-6">
        <WeekReviewCard />
        <SleepStatsCard />

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
