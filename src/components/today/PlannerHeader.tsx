import { useMemo, type ReactNode } from 'react'
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
import { useNow } from '../../hooks/useAppClock'
import { logLimitAt } from '../../lib/timelineBlockEdit'
import { unplannedListIds } from '../../lib/listKind'
import { unrecordedMinutesOnDay } from '../../lib/unrecordedGaps'
import { DayMoodBadge } from './DayMood'

/** 今日の計画の上: 題名と日付・日の移動・睡眠・記録と予定の合計・記録のパネル */
export function PlannerHeader({
  date,
  dateKey,
  viewingToday,
  dayNav,
  load,
  loggedMinutes,
}: {
  date: Date
  dateKey: string
  viewingToday: boolean
  dayNav: ReactNode
  /** その日の空きと置いた To-Do（週の見出しと同じ `dayLoad`） */
  load: DayLoad
  loggedMinutes: number
}) {
  const { t } = useTranslation()
  const df = useDateFormat()
  const onboardingDone = useTaskStore((s) => s.onboardingDone)
  const { plannedMinutes, freeMinutes } = load
  // 空きは週の見出しと同じく今日から先の日だけ（過ぎた日の空きは計画に使わない）
  const showFree = dateKey >= toDateKey(appToday())
  const overCapacity = showFree && load.over
  const plannedTime = formatDuration(plannedMinutes)
  const freeTime = formatDuration(freeMinutes)
  const plannedHint = !showFree
    ? undefined
    : overCapacity
      ? t('planner.overCapacity', { planned: plannedTime, free: freeTime })
      : t('weekCalendar.freeTimeHint', { free: freeTime })
  const tasks = useTaskStore((s) => s.tasks)
  const lists = useTaskStore((s) => s.lists)
  const activeTimer = useTaskStore((s) => s.activeTimer)
  const now = useNow()
  const nowMinute = Math.floor(now.getTime() / 60_000)
  // 記録の無い時間（タイムラインの点線の枠の合計）。今日は今まで、先の日は 0
  const unrecorded = useMemo(
    () => unrecordedMinutesOnDay(tasks, dateKey, logLimitAt(new Date(nowMinute * 60_000)), activeTimer, unplannedListIds(lists)),
    [tasks, lists, dateKey, activeTimer, nowMinute],
  )
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
      {/* 過ぎた日は、締めで付けた気分の記号を睡眠の横に小さく（今日の昼・これからの日には出さない） */}
      {(onboardingDone || !showFree) && (
        <div className="mt-2 flex flex-wrap items-start gap-x-2 md:mt-3">
          {onboardingDone && <SleepRow key={dateKey} dateKey={dateKey} />}
          {!showFree && <DayMoodBadge key={dateKey} dateKey={dateKey} />}
        </div>
      )}
      {/* 記録の合計を主役に、予定は右に小さく。完了数は下の「完了 N 件」と重なるので出さない */}
      {(loggedMinutes > 0 || plannedMinutes > 0 || unrecorded > 0) && (
        // 狭い幅では予定・空きを次の行の右へ送る（記録・記録なしの行と予定の行が互いに折り返して読みにくくならないように）
        <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 md:mt-5">
          {loggedMinutes > 0 && (
            <span className="whitespace-nowrap text-sm font-medium tabular-nums text-zinc-800 dark:text-zinc-200">
              {t('planner.summaryLogged', { time: formatDuration(loggedMinutes) })}
            </span>
          )}
          {/* 記録の無い時間は小さく横に（責めない。タイムラインの点線の枠を押すと埋められる） */}
          {unrecorded > 0 && (
            <span
              className="whitespace-nowrap text-xs tabular-nums text-zinc-400 dark:text-zinc-500"
              {...tip(t('planner.summaryUnrecordedHint'))}
            >
              {t('planner.summaryUnrecorded', { time: formatDuration(unrecorded) })}
            </span>
          )}
          {plannedMinutes > 0 && (
            <span
              {...tip(plannedHint)}
              data-day-free={showFree ? (overCapacity ? 'over' : 'ok') : undefined}
              className={`ml-auto min-w-0 text-right text-xs tabular-nums ${overCapacity ? DUE_TONE_CLASS.overdue : 'text-zinc-400 dark:text-zinc-500'}`}
            >
              {/* 超えた日は色だけに頼らず「（超過）」の文字も付ける（週の見出しと同じ締切の色） */}
              {showFree
                ? t('planner.summaryPlannedFree', { time: plannedTime, free: freeTime })
                : t('planner.summaryPlanned', { time: plannedTime })}
              {overCapacity && ` ${t('planner.overCapacityShort')}`}
              {plannedHint && <span className="sr-only"> {plannedHint}</span>}
            </span>
          )}
        </div>
      )}
      {/* 記録（タイマー・後から記録・分類ごとの時間）。スマホでは色の帯を押すと分類ごとの時間を開く */}
      <div className={loggedMinutes > 0 || plannedMinutes > 0 || unrecorded > 0 ? 'mt-2' : 'mt-4'}>
        <RecordPanel key={dateKey} dateKey={dateKey} viewingToday={viewingToday} />
      </div>
    </header>
  )
}
