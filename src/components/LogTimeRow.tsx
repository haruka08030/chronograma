import type { ReactNode } from 'react'
import { TimeInput } from './TimeInput'
import { addClockMinutes } from '../lib/clockTime'
import { fieldClass } from './ui/fieldClass'

/**
 * 記録の時刻を 1 行で入れる（開始 – 終了）。後に添える 1 行（「翌日まで」・誤り）は `children`。
 * 記録パネルの「後から記録」と、通知の「記録する」（`CompleteWithLogModal`）で同じ
 */
export function LogTimeRow({
  start,
  end,
  onStartChange,
  onEndChange,
  children,
}: {
  start: string
  end: string
  onStartChange: (v: string) => void
  onEndChange: (v: string) => void
  children?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
      <TimeInput value={start} onChange={onStartChange} className={fieldClass({ size: 'sm' }, 'w-[5.5rem] tabular-nums')} />
      <span aria-hidden>–</span>
      <TimeInput
        value={end}
        onChange={onEndChange}
        pickerDefault={start ? addClockMinutes(start, 60) : undefined}
        durationFrom={start || undefined}
        overnight
        className={fieldClass({ size: 'sm' }, 'w-[5.5rem] tabular-nums')}
      />
      {children}
    </div>
  )
}
