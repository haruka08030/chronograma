import { ICON_PATHS } from '../lib/iconPaths'
import { PathIcon } from './PathIcon'

/**
 * カレンダーの枠の中に日付の数字（スマホの下のタブ。今日の日付を入れて、1 日を見る入口だと分かるように）。
 * 大きさは 24px（h-6 w-6）の決まった形。飾りなので読み上げない（名前はタブの文字で伝える）
 */
export function CalendarDateIcon({ day, strokeWidth = 1.5 }: { day: number; strokeWidth?: number }) {
  return (
    <span className="relative inline-flex h-6 w-6 shrink-0" aria-hidden>
      <PathIcon d={ICON_PATHS.calendarFrame} className="h-6 w-6" strokeWidth={strokeWidth} />
      {/* 枠の下の段（9〜21）の真ん中に */}
      <span className="absolute inset-x-0 top-[10.5px] text-center text-[9px] font-bold leading-[9px] tabular-nums">{day}</span>
    </span>
  )
}
