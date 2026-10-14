import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import type { MinuteSpan } from '../../lib/unrecordedGaps'
import { gapKey } from '../../lib/wrapUpGaps'
import { frequentLogs } from '../../lib/logCategory'
import { categoryHex, colorVars } from '../../lib/logCategoryColors'
import { minutesToTime } from '../../lib/clockTime'
import { formatDuration } from '../../lib/timeGrid'
import { requestLogLaterAt } from '../../lib/logLater'
import { chipClass } from '../ui/chipClass'
import { META_TEXT } from '../ui/textClass'

/** 記録を作るチップに出す最近の記録の数 */
const RECENT_CHIPS = 3

/**
 * 記録の無い時間を 1 行ずつ。最近の記録のチップを押すとその時間で記録を作り（行は消える）、
 * 「ほかを記録」はその時間を入れた「後から記録」を開き、「何もしていない」はその日の締めでは聞かない
 */
export function WrapUpGapList({
  dateKey,
  shown,
  more,
  markIdle,
}: {
  dateKey: string
  shown: MinuteSpan[]
  more: number
  markIdle: (g: MinuteSpan) => void
}) {
  const { t } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const addTimeLog = useTaskStore((s) => s.addTimeLog)
  const logCategoryColors = useTaskStore((s) => s.logCategoryColors)
  const recent = useMemo(() => frequentLogs(tasks, RECENT_CHIPS), [tasks])
  const sep = t('common.timeRangeSeparator')

  return (
    <div className="space-y-1" data-wrap-up-gaps>
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {shown.map((g) => {
          const start = minutesToTime(g.start)
          const end = minutesToTime(g.end)
          return (
            <li key={gapKey(g)} className="space-y-1.5 py-2" data-wrap-up-gap={gapKey(g)}>
              <p className="flex items-baseline gap-2">
                <span className="tabular-nums text-zinc-800 dark:text-zinc-200">{`${start}${sep}${end}`}</span>
                <span className={META_TEXT}>{t('planner.gapNoRecord', { duration: formatDuration(g.end - g.start) })}</span>
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                {recent.map((r) => (
                  <button
                    key={r.title}
                    type="button"
                    onClick={() => addTimeLog(r.title, dateKey, start, end, r.category ? [r.category] : [])}
                    aria-label={t('planner.gapRecordAs', { title: r.title, start, end })}
                    className={chipClass({ variant: 'outline', size: 'md' }, 'min-h-9 max-w-[10rem] gap-1.5 md:min-h-7')}
                  >
                    <span
                      aria-hidden
                      className="gc-dot h-2 w-2 shrink-0 rounded-full"
                      style={colorVars(categoryHex(r.category, logCategoryColors))}
                    />
                    <span className="truncate">{r.title}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => requestLogLaterAt(start, end)}
                  className={chipClass({ variant: 'add', size: 'md' }, 'min-h-9 md:min-h-7')}
                >
                  {t('planner.gapRecordOther')}
                </button>
                <button
                  type="button"
                  onClick={() => markIdle(g)}
                  className="ml-auto rounded-md px-1.5 py-1 text-xs text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
                >
                  {t('planner.gapIdle')}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      {more > 0 && <p className={META_TEXT}>{t('planner.gapMore', { count: more })}</p>}
    </div>
  )
}
