import { endOfWeek, format, startOfWeek } from 'date-fns'
import i18n from '../i18n/config'
import { dateFnsLocale, fromDateKey } from './dateKey'

/**
 * 日付の表示形式の名前。形式そのものは i18n の `dateFormat.*`（ja / en）にある。
 * 例は 2026-10-03（土）
 * - monthDay: 10月3日 / Oct 3
 * - monthDayWeekday: 10月3日 (土) / Sat, Oct 3
 * - monthDayWeekdayLong: 10月3日 (土) / Saturday, Oct 3（見出し・予定カード）
 * - shortDate: 10/3 / Oct 3
 * - shortDateWeekday: 10/3 (土) / Sat 10/3
 * - shortDateWeekdayYear: 2026/10/3 (土) / Sat 10/3/2026（今年でない日）
 * - yearMonth: 2026年10月 / October 2026
 * - fullDate: 2026年10月3日 / October 3rd, 2026
 * - monthDayTime: 10月3日 09:05 / Oct 3, 09:05
 */
export const DATE_FORMAT_NAMES = [
  'monthDay',
  'monthDayWeekday',
  'monthDayWeekdayLong',
  'shortDate',
  'shortDateWeekday',
  'shortDateWeekdayYear',
  'yearMonth',
  'fullDate',
  'monthDayTime',
] as const
export type DateFormatName = (typeof DATE_FORMAT_NAMES)[number]

/** 日付（Date か日付キー `yyyy-MM-dd`）を名前の形式で、表示の言語に合わせて書く */
export function formatDate(
  date: Date | string,
  name: DateFormatName,
  language: string | undefined = i18n.resolvedLanguage,
): string {
  const d = typeof date === 'string' ? fromDateKey(date) : date
  const pattern = i18n.getFixedT(language ?? i18n.language)(`dateFormat.${name}`)
  return format(d, pattern, { locale: dateFnsLocale(language) })
}

/**
 * 月曜はじまりの週の範囲。言語で並びが違うので形式キーではなくここで組む
 * - ja: 10月5日〜11日、2026年 / 2026年9月28日〜10月4日
 * - en: Oct 5 – 11, 2026 / Sep 28 – Oct 4, 2026 / Dec 28, 2026 – Jan 3, 2027
 */
export function formatWeekRange(anchor: Date, language: string | undefined = i18n.resolvedLanguage): string {
  const locale = dateFnsLocale(language)
  const ws = startOfWeek(anchor, { weekStartsOn: 1 })
  const we = endOfWeek(anchor, { weekStartsOn: 1 })
  const f = (d: Date, pattern: string) => format(d, pattern, { locale })
  if (language?.startsWith('ja')) {
    const sameMonth = ws.getMonth() === we.getMonth() && ws.getFullYear() === we.getFullYear()
    if (sameMonth) return `${f(ws, 'M月d日')}〜${f(we, 'd日')}、${ws.getFullYear()}年`
    return `${f(ws, 'y年M月d日')}〜${f(we, 'M月d日')}`
  }
  const sameYear = ws.getFullYear() === we.getFullYear()
  const sameMonth = sameYear && ws.getMonth() === we.getMonth()
  if (sameMonth) return `${f(ws, 'MMM d')} – ${f(we, 'd, yyyy')}`
  if (sameYear) return `${f(ws, 'MMM d')} – ${f(we, 'MMM d, yyyy')}`
  return `${f(ws, 'MMM d, yyyy')} – ${f(we, 'MMM d, yyyy')}`
}
