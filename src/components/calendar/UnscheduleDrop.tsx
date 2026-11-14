import { useTranslation } from 'react-i18next'
import { useUnscheduleDrop } from '../../hooks/useUnscheduleDrop'

/** つかんでいる間だけ出す「ここに落とすと日付を外して To-Do に戻します」の帯 */
export function UnscheduleDropStrip({ className = '' }: { className?: string }) {
  const { t } = useTranslation()
  const { dropProps, highlightClass } = useUnscheduleDrop()
  return (
    <div
      {...dropProps}
      className={`flex h-14 shrink-0 items-center justify-center border-t-2 border-dashed border-zinc-300 text-xs text-zinc-500 transition-colors
      dark:border-zinc-700 dark:text-zinc-400 ${highlightClass} ${className}`}
    >
      {t('calendarHub.dropToUnschedule')}
    </div>
  )
}
