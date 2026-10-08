import { addDays } from 'date-fns'
import i18n from '../i18n/config'
import { formatShortDateWeekday } from './dateFormat'
import { fromDateKey, toDateKey } from './dateKey'
import { appTodayKey } from './timeZone'

/** 日付と時刻の組（締切なら dueDate / dueTime、実行日なら scheduledDate / startTime） */
export type DateTimePair = { date: string | null; time: string | null }

/**
 * 右クリックメニュー・シートの「締切 ›」「実行日 ›」の右に出す今の値: 「今日 18:00」「明日」「10/10 (土)」。
 * 選んだタスクで日付・時刻のどちらかが違う、または日付が無いときは出さない（どれの値か分からない）
 */
export function menuDateHint(
  pairs: readonly DateTimePair[],
  language: string | undefined = i18n.resolvedLanguage,
  todayKey = appTodayKey(),
): string | undefined {
  const first = pairs[0]
  if (!first?.date || pairs.some((p) => p.date !== first.date || (p.time ?? null) !== (first.time ?? null))) return undefined
  const t = i18n.getFixedT(language ?? i18n.language)
  const tomorrowKey = toDateKey(addDays(fromDateKey(todayKey), 1))
  const day =
    first.date === todayKey
      ? t('common.today')
      : first.date === tomorrowKey
        ? t('common.tomorrow')
        : // 今年でない日は年も付ける（To-Do の行の日付と同じ）
          formatShortDateWeekday(first.date, language, todayKey)
  return first.time ? `${day} ${first.time}` : day
}
