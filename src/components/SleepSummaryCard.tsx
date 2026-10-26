import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { summarizeSleep } from '../lib/sleep'
import { isSleepTask } from '../types/task'
import { isActiveTask } from '../lib/taskLifecycle'
import { formatDuration } from '../lib/timeGrid'
import { useAppTodayKey } from '../hooks/useAppClock'
import { SleepMoonIcon, SleepWakeIcon } from './SleepTimesField'
import { ChevronRightIcon } from './icons'
import { CARD_TITLE_CLASS } from './ui/headingClass'
import { META_TEXT } from './ui/textClass'

const DAYS = 14

/**
 * 統計の「睡眠」（#628）。直近 14 日の平均（睡眠時間・☾ 寝た・日の出 起きた）だけを出し、押すと睡眠のページへ。
 * 睡眠の記録が 1 件も無い人には出さない
 */
export function SleepSummaryCard() {
  const { t } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const selectView = useTaskStore((s) => s.selectView)
  const todayKey = useAppTodayKey()
  const summary = useMemo(() => summarizeSleep(tasks, todayKey, DAYS), [tasks, todayKey])
  const hasAny = useMemo(() => summary.count > 0 || tasks.some((x) => isSleepTask(x) && isActiveTask(x)), [summary.count, tasks])
  if (!hasAny) return null

  return (
    <button
      type="button"
      onClick={() => selectView('sleep')}
      aria-label={t('sleepPage.summaryAria')}
      className="block w-full rounded-xl border border-zinc-200 bg-white p-5 text-left transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:bg-zinc-800/60"
    >
      <span className="flex items-center gap-2">
        <span className={`flex-1 ${CARD_TITLE_CLASS}`}>{t('sleepStats.title')}</span>
        <ChevronRightIcon className="h-4 w-4 shrink-0 text-zinc-400" />
      </span>
      {summary.count > 0 ? (
        <span className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1 tabular-nums">
          <span className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{formatDuration(summary.avgMinutes ?? 0)}</span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{t('sleepStats.avg')}</span>
          </span>
          <span className="flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
            <SleepMoonIcon />
            {summary.avgBed}
          </span>
          <span className="flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
            <SleepWakeIcon />
            {summary.avgWake}
          </span>
          <span className={`basis-full ${META_TEXT}`}>{t('sleepPage.summaryRange', { days: DAYS, count: summary.count })}</span>
        </span>
      ) : (
        <span className={`mt-2 block ${META_TEXT}`}>{t('sleepPage.noRecord')}</span>
      )}
    </button>
  )
}
