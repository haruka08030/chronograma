import { useTranslation } from 'react-i18next'
import type { DayLoad } from '../../lib/dayLoad'
import { formatDuration, formatDurationShort } from '../../lib/timeGrid'
import { tip } from '../../lib/tooltip'
import { DUE_TONE_CLASS } from '../ui/dueTone'

/**
 * 週の見出しの日付の下の 1 行: その日の空き（「空き 3h」）。置いた To-Do が空きを超える日は
 * 「空き 3h / 5h」と置いた時間を足して締切の色にする（色だけに頼らず、数字が増えることでも分かる）。
 * ふだんは落ち着いた灰色の小さな文字（ごちゃつかせない）。読み上げは短い表示ではなく文で
 */
export function DayFreeTime({ load }: { load: DayLoad }) {
  const { t } = useTranslation()
  const free = formatDurationShort(load.freeMinutes)
  const planned = formatDurationShort(load.plannedMinutes)
  const hint = load.over
    ? t('weekCalendar.freeTimeOverHint', { free: formatDuration(load.freeMinutes), planned: formatDuration(load.plannedMinutes) })
    : t('weekCalendar.freeTimeHint', { free: formatDuration(load.freeMinutes) })
  return (
    <div
      {...tip(hint)}
      data-day-free={load.over ? 'over' : 'ok'}
      className={`mt-0.5 truncate text-[10px] font-normal leading-tight tabular-nums
        ${load.over ? DUE_TONE_CLASS.overdue : 'text-zinc-400 dark:text-zinc-500'}`}
    >
      {load.over ? (
        <>
          <span aria-hidden className="max-md:hidden">
            {t('weekCalendar.freeTimeOver', { free, planned })}
          </span>
          {/* スマホの週の帯は 1 日の幅が狭いので「空き」を省いて数字だけ（「2h/2h45」） */}
          <span aria-hidden className="md:hidden">
            {t('weekCalendar.freeTimeOverShort', { free, planned })}
          </span>
        </>
      ) : (
        <span aria-hidden>{t('weekCalendar.freeTime', { free })}</span>
      )}
      <span className="sr-only">{hint}</span>
    </div>
  )
}
