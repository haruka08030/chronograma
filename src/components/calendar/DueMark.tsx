import { useTranslation } from 'react-i18next'
import { daysBetween, dueSoonTone, type DueItem } from '../../lib/dues'
import { tip } from '../../lib/tooltip'
import { useAppTodayKey } from '../../hooks/useAppClock'
import { NOTICE_TONE_CLASS } from '../ui/dueTone'

/**
 * カレンダーの引き落とし・期限の日の印（#454）。祝日の名前と同じ所に、◇ と名前だけ（予定ではないので枠も塗りも付けない）。
 * 今日・明日は濃く（締切の赤・オレンジは使わない）、過ぎた日は薄く
 */
export function DueMark({
  item,
  dateKey,
  size = 'xs',
  wrap = false,
  className = '',
}: {
  item: DueItem
  dateKey: string
  size?: 'xs' | 'sm'
  wrap?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  const today = useAppTodayKey()
  const days = daysBetween(today, dateKey)
  const tone = days < 0 ? 'past' : dueSoonTone(days)
  return (
    <span
      {...tip(t('common.withNote', { title: item.title, note: t('addons.dues.name') }))}
      data-due-mark
      className={`block ${NOTICE_TONE_CLASS[tone]} ${wrap ? 'line-clamp-2 [overflow-wrap:anywhere]' : 'truncate'}
        ${size === 'sm' ? 'text-xs' : 'text-[10px] leading-tight'} ${className}`}
    >
      <span aria-hidden>◇ </span>
      {item.title}
    </span>
  )
}
