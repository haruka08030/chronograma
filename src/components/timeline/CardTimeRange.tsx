import { TimeInput } from '../TimeInput'
import { fieldClass } from '../ui/fieldClass'

/**
 * 予定・記録のカードの「開始 – 終了」の時刻欄（Google の予定のカードと To-Do・記録のカードで共有）。
 * 打てば分単位で入る（1407 / 14:07）。空にはしない
 */
export function CardTimeRange({
  startTime,
  endTime,
  onStart,
  onEnd,
  startLabel,
  endLabel,
}: {
  startTime: string
  endTime: string
  onStart: (v: string) => void
  onEnd: (v: string) => void
  startLabel?: string
  endLabel?: string
}) {
  const smallField = fieldClass({ size: 'sm' })
  return (
    <div className="flex w-full items-center gap-1.5">
      <TimeInput value={startTime} onChange={(v) => v && onStart(v)} ariaLabel={startLabel} className={`w-[5.5rem] ${smallField}`} />
      <span className="text-zinc-400">–</span>
      <TimeInput value={endTime} onChange={(v) => v && onEnd(v)} ariaLabel={endLabel} className={`w-[5.5rem] ${smallField}`} />
    </div>
  )
}
