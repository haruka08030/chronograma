import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { TimeInput } from './TimeInput'
import { SleepBar } from './SleepBar'
import { addClockMinutes, endAfterStartEdit, endWithinDay } from '../lib/clockTime'
import { FIELD_FOCUS_RING, TIME_FIELD_WIDTH, fieldClass } from './ui/fieldClass'

export type TimeRange = { startTime: string; endTime: string }

/** 欄の大きさ: sm はカード・フォーム・行、md は詳細、inline は睡眠の行に溶け込む小さな欄 */
type TimeRangeSize = 'sm' | 'md' | 'inline'

const INPUT_CLASS: Record<TimeRangeSize, string> = {
  sm: fieldClass({ size: 'sm' }, 'w-[4.5rem] tabular-nums'),
  md: fieldClass({}, `${TIME_FIELD_WIDTH} tabular-nums`),
  // 行に溶け込む小さな欄なので fieldClass は使わないが、フォーカスは他の入力欄と同じリングで見せる
  inline: `w-[3.75rem] rounded-md bg-zinc-50 px-1.5 py-1 text-xs tabular-nums text-zinc-900 outline-none dark:bg-zinc-800 dark:text-zinc-100 ${FIELD_FOCUS_RING}`,
}

/**
 * 「開始 – 終了」の時刻の欄（予定・記録・習慣・睡眠・テンプレート・時間割で共通）。
 * - 開始を動かしたときの終わりはここで決める: 予定（`kind: 'plan'`）は長さを保ってずらし（`endAfterStartEdit`。
 *   日をまたげない予定は 23:59 で止め、`overnight` の習慣は 24 時間で回す）、記録・睡眠（`kind: 'log'`）は実際の時刻なので開始だけ直す
 * - 終わりの候補は開始の 15 分後から長さを添えて並べる（`durations`。終わりの日を別に選ぶ欄は外す）。
 *   記録・睡眠・`overnight` は翌日の開始の手前まで 1 周
 * - 変えた時刻は 2 つそろえて `onChange` に渡す（同じ値なら呼ばない）。`required` は空にした値を受け取らない
 * - 後に添える 1 行（長さ・「翌日まで」・誤り・ボタン）は `children`
 */
export function TimeRangeFields({
  startTime,
  endTime,
  onChange,
  kind = 'plan',
  overnight = kind === 'log',
  fillMinutes,
  withEnd = true,
  durations = true,
  required = false,
  endNeedsStart = false,
  size = 'sm',
  separator = 'dash',
  wrap = true,
  startLabel,
  endLabel,
  groupLabel,
  startPickerDefault,
  endPickerDefault,
  className = '',
  children,
}: {
  startTime: string
  endTime: string
  onChange: (next: TimeRange) => void
  /** plan: 予定（開始を動かすと終わりもずらす）。log: 記録・睡眠（開始だけ直す） */
  kind?: 'plan' | 'log'
  /** 終わりが翌日にかかれる（記録・睡眠・習慣）。既定は記録・睡眠だけ */
  overnight?: boolean
  /** 終わりが空のときに埋める長さ・終わりの候補の最初の位置（分） */
  fillMinutes?: number
  /** 終わりの欄を出す（時刻だけの習慣は false） */
  withEnd?: boolean
  /** 終わりの候補に長さを添える */
  durations?: boolean
  required?: boolean
  /** 開始が無い間は終わりを押せない */
  endNeedsStart?: boolean
  size?: TimeRangeSize
  /** dash: 「–」、sleep: 睡眠の色の線 */
  separator?: 'dash' | 'sleep'
  /** 狭いと折り返す（1 行に並べる行・カードの中は false） */
  wrap?: boolean
  startLabel?: string
  endLabel?: string
  groupLabel?: string
  startPickerDefault?: string
  endPickerDefault?: string
  className?: string
  children?: ReactNode
}) {
  const { t } = useTranslation()
  const inputClass = INPUT_CLASS[size]
  const commitStart = (v: string) => {
    if ((required && !v) || v === startTime) return
    const end = kind === 'plan' && withEnd ? endAfterStartEdit(startTime, endTime, v, fillMinutes, overnight) : endTime
    onChange({ startTime: v, endTime: end })
  }
  const commitEnd = (v: string) => {
    if ((required && !v) || v === endTime) return
    onChange({ startTime, endTime: v })
  }
  const endDefault =
    endPickerDefault ??
    (startTime && fillMinutes != null
      ? overnight
        ? addClockMinutes(startTime, fillMinutes)
        : endWithinDay(startTime, fillMinutes)
      : undefined)
  return (
    <div
      role={groupLabel ? 'group' : undefined}
      aria-label={groupLabel}
      className={`flex ${wrap ? 'flex-wrap' : ''} items-center gap-x-1.5 gap-y-1 text-zinc-500 dark:text-zinc-400 ${size === 'inline' ? 'text-xs' : 'text-sm'} ${className}`}
    >
      <TimeInput
        value={startTime}
        onChange={commitStart}
        pickerDefault={startPickerDefault}
        ariaLabel={startLabel ?? t('common.start')}
        className={inputClass}
      />
      {withEnd ? (
        <>
          {separator === 'sleep' ? (
            <SleepBar />
          ) : (
            <span aria-hidden className="text-zinc-400 dark:text-zinc-500">
              {t('common.timeRangeSeparator')}
            </span>
          )}
          <TimeInput
            value={endTime}
            onChange={commitEnd}
            disabled={endNeedsStart && !startTime}
            pickerDefault={endDefault || undefined}
            durationFrom={durations ? startTime || undefined : undefined}
            overnight={overnight}
            ariaLabel={endLabel ?? t('common.end')}
            className={inputClass}
          />
        </>
      ) : null}
      {children}
    </div>
  )
}
