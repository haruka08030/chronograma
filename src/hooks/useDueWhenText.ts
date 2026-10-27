import { useTranslation } from 'react-i18next'
import type { DueItem } from '../lib/dues'
import { useAppTodayKey } from './useAppClock'
import { useDateFormat } from './useDateFormat'

/** 引き落とし・期限の日付。比べる日と同じ年なら「3月1日」、違う年なら「2029年3月1日」 */
function useDueDate(): (date: string, baseKey: string) => string {
  const df = useDateFormat()
  return (date, baseKey) => (date.slice(0, 4) === baseKey.slice(0, 4) ? df.monthDay(date) : df.fullDate(date))
}

/** 期限がいつ起きるか（「毎月 27 日」「毎年 3月1日」「3月1日」「2029年3月1日」、#454） */
export function useDueWhenText(): (item: Pick<DueItem, 'date' | 'repeat'>) => string {
  const { t } = useTranslation()
  const df = useDateFormat()
  const today = useAppTodayKey()
  const dueDate = useDueDate()
  return (item) =>
    item.repeat === 'monthly'
      ? t('dues.monthly', { day: Number(item.date.slice(8, 10)) })
      : item.repeat === 'yearly'
        ? t('dues.yearly', { date: df.monthDay(item.date) })
        : dueDate(item.date, today)
}

/**
 * 次の日までの残り（「今日」「明日」「3月1日 · あと 3 日」、過ぎた 1 回きりは「過ぎました」）。
 * 追加機能の一覧と今日の計画で同じ書き方。`baseKey` は比べる日（今日の計画は見ている日）
 */
export function useDueDayText(): (next: string | null, daysLeft: number, baseKey: string) => string {
  const { t } = useTranslation()
  const dueDate = useDueDate()
  return (next, daysLeft, baseKey) =>
    next === null
      ? t('dues.passed')
      : daysLeft === 0
        ? t('dues.today')
        : daysLeft === 1
          ? t('dues.tomorrow')
          : `${dueDate(next, baseKey)} · ${t('dues.daysLeft', { count: daysLeft })}`
}
