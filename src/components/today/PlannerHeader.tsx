import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import type { DayLoad } from '../../lib/dayLoad'
import { formatDuration } from '../../lib/timeGrid'
import { tip } from '../../lib/tooltip'
import { toDateKey } from '../../lib/dateKey'
import { appToday } from '../../lib/timeZone'
import { useDateFormat } from '../../hooks/useDateFormat'
import { RecordPanel } from '../RecordPanel'
import { SleepRow } from '../SleepRow'
import { DUE_TONE_CLASS } from '../ui/dueTone'
import { PAGE_TITLE_CLASS } from '../ui/headingClass'
import { SUBTLE_TEXT } from '../ui/textClass'
import { DayMoodBadge } from './DayMood'
import { useOnboardingFinishedToday } from '../../hooks/useShowsOnboarding'

/** 今日の計画の上: 題名と日付・日の移動・睡眠・置いた / 空き・記録のパネル */
export function PlannerHeader({
  date,
  dateKey,
  viewingToday,
  dayNav,
  load,
  reviewing,
}: {
  date: Date
  dateKey: string
  viewingToday: boolean
  dayNav: ReactNode
  /** その日の空きと置いた To-Do（週の見出しと同じ `dayLoad`） */
  load: DayLoad
  /** 振り返るとき（過ぎた日と、今日の締めの時刻から。`showsDayResult`）。ラベル別の時間を出し、置いた / 空きは出さない */
  reviewing: boolean
}) {
  const { t } = useTranslation()
  const df = useDateFormat()
  // 案内を終えた日の間も出さない（最初の成功の場面に新しいものを重ねない）
  const onboardingDone = useTaskStore((s) => s.onboardingDone)
  const finishedToday = useOnboardingFinishedToday()
  const showSleep = onboardingDone && !finishedToday
  const { plannedMinutes, freeMinutes } = load
  // 空きは週の見出しと同じく今日から先の日だけ（過ぎた日の空きは計画に使わない）
  const showFree = dateKey >= toDateKey(appToday())
  const overCapacity = showFree && load.over
  const plannedTime = formatDuration(plannedMinutes)
  const freeTime = formatDuration(freeMinutes)
  const plannedHint = overCapacity
    ? t('planner.overCapacity', { planned: plannedTime, free: freeTime })
    : t('weekCalendar.freeTimeHint', { free: freeTime })
  const showSummary = showFree && !reviewing && plannedMinutes > 0
  // スマホは To-Do を最初の画面に出したいので、上の部分を詰める（日付は題名の横、間隔は狭く）
  return (
    <header className="px-6 pb-3 pt-4 md:pb-5 md:pt-8">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <h1 className={PAGE_TITLE_CLASS}>{viewingToday ? t('planner.todayTitle') : df.monthDayWeekdayLong(date)}</h1>
          {viewingToday && <span className={`truncate md:hidden ${SUBTLE_TEXT}`}>{df.monthDayWeekdayLong(date)}</span>}
        </div>
        {dayNav}
      </div>
      {viewingToday && <p className={`mt-1 hidden md:block ${SUBTLE_TEXT}`}>{df.monthDayWeekdayLong(date)}</p>}
      {/* 朝に入れる睡眠（寝た・起きた時刻）。記録の時間には数えない。
          はじめの案内が出ている間と、案内を終えた日は出さない（最初に目に入るのが睡眠だと、何をするアプリか分からない） */}
      {/* 過ぎた日は、締めで付けた気分の記号を睡眠の横に小さく（今日の昼・これからの日には出さない） */}
      {(showSleep || !showFree) && (
        <div className="mt-2 flex flex-wrap items-start gap-x-2 md:mt-3">
          {showSleep && <SleepRow key={`sleep-${dateKey}`} dateKey={dateKey} />}
          {!showFree && <DayMoodBadge key={`mood-${dateKey}`} dateKey={dateKey} />}
        </div>
      )}
      {/* 計画しているとき（今日・先の日）だけ、置いた To-Do と空き。過ぎた日・記録の合計の数字は出さない（記入漏れ・重なりで意味がぶれる） */}
      {showSummary && (
        <div className="mt-3 flex justify-end md:mt-5">
          <span
            {...tip(plannedHint)}
            data-day-free={overCapacity ? 'over' : 'ok'}
            className={`min-w-0 text-right text-xs tabular-nums ${overCapacity ? DUE_TONE_CLASS.overdue : 'text-zinc-400 dark:text-zinc-500'}`}
          >
            {/* 超えた日は色だけに頼らず「（超過）」の文字も付ける（週の見出しと同じ締切の色） */}
            {t('planner.summaryPlannedFree', { time: plannedTime, free: freeTime })}
            {overCapacity && ` ${t('planner.overCapacityShort')}`}
            <span className="sr-only"> {plannedHint}</span>
          </span>
        </div>
      )}
      {/* 記録（タイマー・後から記録）。ラベル別の時間は振り返るとき（過ぎた日・今日の締めの時刻から）だけ */}
      <div className={showSummary ? 'mt-2' : 'mt-4'}>
        <RecordPanel key={dateKey} dateKey={dateKey} viewingToday={viewingToday} reviewing={reviewing} />
      </div>
    </header>
  )
}
