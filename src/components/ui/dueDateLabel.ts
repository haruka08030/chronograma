import type { TFunction } from 'i18next'
import { addDays, differenceInCalendarDays } from 'date-fns'
import { appTodayKey } from '../../lib/timeZone'
import { dueToneOf } from '../../lib/dueTone'
import { fromDateKey, toDateKey } from '../../lib/dateKey'
import { formatShortDateWeekday } from '../../lib/dateFormat'
import type { DateTone } from './dueTone'

/** 締切が近いと言う日数（この日数以内は「あと ◯ 日」で明日と同じ色） */
const DUE_SOON_DAYS = 3

/**
 * 締切の日付を、色が見分けにくくても分かる言葉で: 「10/8 (木)まで・あと 2 日」「10/5 (月)まで・1日遅れ」。
 * 「まで」が付くので、時計の実行日とも文字で分かれる。To-Do の行・今日の計画の行・授業の予定のカードの課題（#309）で同じ書き方。
 * `base` は比べる日（今日の計画で別の日を見ているときはその日。`now` は締切の時刻が過ぎたかを見る今）。無ければ今日
 */
export function dueDateLabel(
  iso: string,
  time: string | null,
  t: TFunction,
  language: string | undefined,
  base: { dayKey: string; now?: Date } = { dayKey: appTodayKey() },
): { text: string; tone: DateTone } {
  const { dayKey, now } = base
  const key = iso.slice(0, 10)
  const tone = dueToneOf(key, time, dayKey, { now })
  const days = differenceInCalendarDays(fromDateKey(key), fromDateKey(dayKey))
  const date =
    key === dayKey
      ? t('common.today')
      : key === toDateKey(addDays(fromDateKey(dayKey), 1))
        ? t('common.tomorrow')
        : formatShortDateWeekday(key, language, dayKey)
  const by = time ? t('taskItem.dueByTime', { date, time }) : t('taskItem.dueBy', { date })
  if (days < 0) return { text: t('taskItem.dueLate', { by, count: -days }), tone }
  if (days >= 2 && days <= DUE_SOON_DAYS) return { text: t('taskItem.dueSoon', { by, count: days }), tone: 'tomorrow' }
  return { text: by, tone }
}
