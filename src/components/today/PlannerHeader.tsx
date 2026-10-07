import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { formatDuration } from '../../lib/timeGrid'
import { toDateKey } from '../../lib/dateKey'
import { appToday } from '../../lib/timeZone'
import { useDateFormat } from '../../hooks/useDateFormat'
import { RecordPanel } from '../RecordPanel'
import { SleepRow } from '../SleepRow'
import { DUE_TONE_CLASS } from '../ui/dueTone'
import { PAGE_TITLE_CLASS } from '../ui/headingClass'
import { SUBTLE_TEXT } from '../ui/textClass'

/** 今日の計画の上: 題名と日付・日の移動・睡眠・記録と予定の合計・記録のパネル */
export function PlannerHeader({
  date,
  dateKey,
  viewingToday,
  dayNav,
  plannedMinutes,
  loggedMinutes,
}: {
  date: Date
  dateKey: string
  viewingToday: boolean
  dayNav: ReactNode
  plannedMinutes: number
  loggedMinutes: number
}) {
  const { t } = useTranslation()
  const df = useDateFormat()
  const dailyCapacityMinutes = useTaskStore((s) => s.dailyCapacityMinutes)
  const onboardingDone = useTaskStore((s) => s.onboardingDone)
  const overCapacity = dateKey >= toDateKey(appToday()) && plannedMinutes > dailyCapacityMinutes
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
          はじめの案内が出ている間は出さない（最初に目に入るのが睡眠だと、何をするアプリか分からない） */}
      {onboardingDone && (
        <div className="mt-2 md:mt-3">
          <SleepRow key={dateKey} dateKey={dateKey} />
        </div>
      )}
      {/* 記録の合計を主役に、予定は右に小さく。完了数は下の「完了 N 件」と重なるので出さない */}
      {(loggedMinutes > 0 || plannedMinutes > 0) && (
        <div className="mt-3 flex items-baseline justify-between gap-3 md:mt-5">
          {loggedMinutes > 0 ? (
            <span className="text-sm font-medium tabular-nums text-zinc-800 dark:text-zinc-200">
              {t('planner.summaryLogged', { time: formatDuration(loggedMinutes) })}
            </span>
          ) : (
            <span />
          )}
          {plannedMinutes > 0 && (
            <span
              className={`whitespace-nowrap text-xs tabular-nums ${overCapacity ? DUE_TONE_CLASS.overdue : 'text-zinc-400 dark:text-zinc-500'}`}
              title={overCapacity ? t('planner.overCapacity', { capacity: formatDuration(dailyCapacityMinutes) }) : undefined}
            >
              {t('planner.summaryPlanned', { time: formatDuration(plannedMinutes) })}
              {overCapacity && ` ${t('planner.overCapacityShort')}`}
            </span>
          )}
        </div>
      )}
      {/* 記録（タイマー・後から記録・分類ごとの時間）。スマホでは色の帯を押すと分類ごとの時間を開く */}
      <div className={loggedMinutes > 0 || plannedMinutes > 0 ? 'mt-2' : 'mt-4'}>
        <RecordPanel key={dateKey} dateKey={dateKey} viewingToday={viewingToday} />
      </div>
    </header>
  )
}
