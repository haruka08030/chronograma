import { tip } from '../../lib/tooltip'

/**
 * 祝日の名前（月のマスの日付の横・週の終日の行・スケジュールの日の行で同じ見た目）。
 * 予定ではないので枠も塗りも付けず、落ち着いた灰色の文字だけ（Google カレンダーの祝日と同じく控えめに）
 */
export function HolidayLabel({
  name,
  size = 'xs',
  wrap = false,
  className = '',
}: {
  name: string
  size?: 'xs' | 'sm'
  /** 狭い所（スマホの月のマス）は 1 行で切らずに 2 行まで折り返す */
  wrap?: boolean
  className?: string
}) {
  return (
    <span
      {...tip(name)}
      data-holiday
      className={`block text-zinc-500 dark:text-zinc-400 ${wrap ? 'line-clamp-2 [overflow-wrap:anywhere]' : 'truncate'}
        ${size === 'sm' ? 'text-xs' : 'text-[10px] leading-tight'} ${className}`}
    >
      {name}
    </span>
  )
}
