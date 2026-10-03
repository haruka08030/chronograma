import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { DATE_FORMAT_NAMES, formatDate, formatWeekRange, type DateFormatName } from '../lib/dateFormat'

type DateFormatter = (date: Date | string) => string
export type DateFormatters = Record<DateFormatName, DateFormatter> & { weekRange: (anchor: Date) => string }

/**
 * 日付の表示を名前で呼ぶ（Date か日付キーを渡す）。言語が変わると作り直すので、useMemo の依存に入れれば表示も追いつく。
 * 形式の一覧は lib/dateFormat.ts。React の外では `formatDate(date, name)` を使う
 *
 *   const df = useDateFormat()
 *   df.monthDayWeekday(dateKey) // 10月3日 (土) / Sat, Oct 3
 */
export function useDateFormat(): DateFormatters {
  const { i18n } = useTranslation()
  const language = i18n.resolvedLanguage
  return useMemo(() => {
    const named = Object.fromEntries(
      DATE_FORMAT_NAMES.map((name) => [name, (date: Date | string) => formatDate(date, name, language)]),
    ) as Record<DateFormatName, DateFormatter>
    return { ...named, weekRange: (anchor: Date) => formatWeekRange(anchor, language) }
  }, [language])
}
