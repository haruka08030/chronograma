import type { ReactNode } from 'react'
import { colorVars } from '../../lib/logCategoryColors'
import { ROW_PRESS_CLASS } from '../ui/rowStateClass'
import { META_TONE_CLASS } from './plannerRowMeta'

/**
 * 今日の計画の予定の 1 行（スマホの「今」「次」の授業・バイト・Google の予定）。予定は ✓ が無いので丸の代わりに色の点。
 * 押すとタイムラインと同じ予定のカード。並びの幅は `PlannerTaskRow` に合わせる
 */
export function PlannerPlanRow({
  title,
  time,
  colorHex,
  lead,
  onOpen,
}: {
  title: string
  time: string
  colorHex: string
  lead?: ReactNode
  onOpen: (el: HTMLElement) => void
}) {
  return (
    <li>
      <button
        type="button"
        data-plan-row
        onClick={(e) => onOpen(e.currentTarget)}
        className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60 ${ROW_PRESS_CLASS}`}
      >
        {/* 完了の丸（20px）と同じ幅 */}
        <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center">
          <span className="gc-dot h-2.5 w-2.5 rounded-full" style={colorVars(colorHex)} />
        </span>
        {lead && <span className="shrink-0 text-xs font-medium text-zinc-500 dark:text-zinc-400">{lead}</span>}
        <span className="min-w-0 flex-1 truncate py-2.5 text-[15px] text-zinc-800 dark:text-zinc-100">{title}</span>
        <span className={`shrink-0 text-xs tabular-nums ${META_TONE_CLASS.muted}`}>{time}</span>
      </button>
    </li>
  )
}
