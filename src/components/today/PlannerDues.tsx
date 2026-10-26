import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { dueSoonTone, duesSoon } from '../../lib/dues'
import { useDues } from '../../hooks/useDues'
import { useDateFormat } from '../../hooks/useDateFormat'
import { NOTICE_TONE_CLASS } from '../ui/dueTone'

/**
 * 今日の計画の引き落とし・期限の日（#454）。当日と、知らせ始める日（何日前）から当日までのものだけを、見出しの下に 1 行ずつ。
 * やることではないので ✓ も置き場所も無く、統計・やり残しにも数えない。見ている日を基準にする
 */
export function PlannerDues({ dateKey }: { dateKey: string }) {
  const { t } = useTranslation()
  const df = useDateFormat()
  const dues = useDues()
  const soon = useMemo(() => duesSoon(dues, dateKey), [dues, dateKey])
  if (soon.length === 0) return null
  return (
    <ul aria-label={t('addons.dues.name')} className="mx-6 mb-3 space-y-0.5">
      {soon.map(({ item, date, daysLeft }) => (
        <li key={item.id} className="flex items-baseline gap-2 text-sm">
          <span aria-hidden className="text-zinc-400">
            ◇
          </span>
          <span className="min-w-0 flex-1 truncate text-zinc-700 dark:text-zinc-200">{item.title}</span>
          <span className={`shrink-0 text-xs tabular-nums ${NOTICE_TONE_CLASS[dueSoonTone(daysLeft)]}`}>
            {daysLeft === 0
              ? t('dues.today')
              : daysLeft === 1
                ? t('dues.tomorrow')
                : `${df.monthDay(date)} · ${t('dues.daysLeft', { count: daysLeft })}`}
          </span>
        </li>
      ))}
    </ul>
  )
}
