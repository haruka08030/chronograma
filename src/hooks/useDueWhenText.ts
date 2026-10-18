import { useTranslation } from 'react-i18next'
import type { DueItem } from '../lib/dues'
import { useDateFormat } from './useDateFormat'

/** 期限がいつ起きるか（「毎月 27日」「毎年 3月1日」「2029年3月1日」、#454） */
export function useDueWhenText(): (item: Pick<DueItem, 'date' | 'repeat'>) => string {
  const { t } = useTranslation()
  const df = useDateFormat()
  return (item) =>
    item.repeat === 'monthly'
      ? t('dues.monthly', { day: Number(item.date.slice(8, 10)) })
      : item.repeat === 'yearly'
        ? t('dues.yearly', { date: df.monthDay(item.date) })
        : df.fullDate(item.date)
}
