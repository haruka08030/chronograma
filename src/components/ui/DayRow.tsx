import type { CSSProperties, MouseEvent, ReactNode } from 'react'
import { EventMark } from './CompletionCircle'

/** 1 行の並び（カレンダーの日パネル）の左の時刻の列。To-Do の行（`TaskItem` の `compact`）と同じ幅にそろえる（To-Do は時刻のあるときだけ） */
export const DAY_ROW_TIME_CLASS = 'w-10 shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400'

/** 1 行の並びの行の高さ・余白。To-Do の行と同じにする */
export const DAY_ROW_PAD_CLASS = 'px-2.5 py-1.5 md:min-h-8 md:py-1'

/**
 * 時刻・色の丸・題名を 1 行に並べる行（Google の予定・記録）。箱にせず、色は完了の丸と同じ大きさの丸（`EventMark`）だけで見せる。
 * `dotStyle` は `colorVars(hex)`（睡眠は `--c` に睡眠の色）
 */
export function DayRow({
  time,
  dotStyle,
  title,
  trailing,
  onClick,
  onContextMenu,
}: {
  time: string | null
  dotStyle: CSSProperties
  title: string
  trailing?: ReactNode
  onClick: (e: MouseEvent<HTMLButtonElement>) => void
  onContextMenu?: (e: MouseEvent<HTMLButtonElement>) => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`flex w-full items-center gap-2 rounded-xl text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/40 ${DAY_ROW_PAD_CLASS}`}
    >
      <span className={DAY_ROW_TIME_CLASS}>{time}</span>
      <EventMark style={dotStyle} />
      <span className="min-w-0 flex-1 truncate text-sm text-zinc-800 dark:text-zinc-200">{title}</span>
      {trailing}
    </button>
  )
}
