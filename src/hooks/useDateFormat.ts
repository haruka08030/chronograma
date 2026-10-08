import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { DATE_FORMAT_NAMES, formatDate, formatShortDateWeekday, formatWeekRange, type DateFormatName } from '../lib/dateFormat'
import type { WeekStartDay } from '../lib/weekStart'
import { useWeekStartsOn } from './useWeekStartsOn'

type DateFormatter = (date: Date | string) => string
export type DateFormatters = Record<DateFormatName, DateFormatter> & {
  /** その日を含む週の範囲。週の開始日は設定のもの（習慣の週のように決まっているときは渡す） */
  weekRange: (anchor: Date, weekStartsOn?: WeekStartDay) => string
  /** 「10/3 (土)」、今年でない日は年も付ける */
  shortDateWeekdayAnyYear: DateFormatter
}

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
  const appWeekStart = useWeekStartsOn()
  return useMemo(() => {
    const named = Object.fromEntries(
      DATE_FORMAT_NAMES.map((name) => [name, (date: Date | string) => formatDate(date, name, language)]),
    ) as Record<DateFormatName, DateFormatter>
    return {
      ...named,
      weekRange: (anchor: Date, weekStartsOn: WeekStartDay = appWeekStart) => formatWeekRange(anchor, language, weekStartsOn),
      shortDateWeekdayAnyYear: (date: Date | string) => formatShortDateWeekday(date, language),
    }
  }, [language, appWeekStart])
}
