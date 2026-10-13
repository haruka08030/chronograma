import type { TFunction } from 'i18next'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { appTodayKey, isAppToday, isAppTomorrow } from '../../lib/timeZone'
import { dueToneOf } from '../../lib/dueTone'
import { fromDateKey } from '../../lib/dateKey'
import { formatShortDateWeekday } from '../../lib/dateFormat'
import type { DateTone } from './dueTone'

/** 締切が近いと言う日数（この日数以内は「あと ◯ 日」で明日と同じ色） */
const DUE_SOON_DAYS = 3

/**
 * 締切の日付を、色が見分けにくくても分かる言葉で: 「10/8 (木)まで・あと 2 日」「10/5 (月)まで・1日遅れ」。
 * 「まで」が付くので、時計の実行日とも文字で分かれる。To-Do の行と、授業の予定のカードの課題（#309）で同じ書き方
 */
export function dueDateLabel(
  iso: string,
  time: string | null,
  t: TFunction,
  language: string | undefined,
): { text: string; tone: DateTone } {
  const d = parseISO(iso)
  const tone = dueToneOf(iso, time, appTodayKey())
  const days = differenceInCalendarDays(d, fromDateKey(appTodayKey()))
  const date = isAppToday(d) ? t('common.today') : isAppTomorrow(d) ? t('common.tomorrow') : formatShortDateWeekday(d, language)
  const by = time ? t('taskItem.dueByTime', { date, time }) : t('taskItem.dueBy', { date })
  if (days < 0) return { text: t('taskItem.dueLate', { by, count: -days }), tone }
  if (days >= 2 && days <= DUE_SOON_DAYS) return { text: t('taskItem.dueSoon', { by, count: days }), tone: 'tomorrow' }
  return { text: by, tone }
}
