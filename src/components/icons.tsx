import type { CSSProperties } from 'react'
import { ICON_PATHS } from '../lib/iconPaths'

/**
 * アプリ全体で使うアイコン（Heroicons の outline と同じ形）。
 * 同じ形を画面ごとに書き写さず、ここから使う。大きさ・色は className、線の太さは strokeWidth で。
 * 飾りなので読み上げない（意味はボタンの aria-label で伝える）。
 */
export interface IconProps {
  className?: string
  style?: CSSProperties
  /** 線の太さ（線のアイコンだけ。既定 2） */
  strokeWidth?: number
}

function strokeIcon(d: string) {
  return function StrokeIcon({ className, style, strokeWidth = 2 }: IconProps) {
    return (
      <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={strokeWidth} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d={d} />
      </svg>
    )
  }
}

function filledIcon(d: string) {
  return function FilledIcon({ className, style }: IconProps) {
    return (
      <svg className={className} style={style} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path d={d} />
      </svg>
    )
  }
}

export const CheckIcon = strokeIcon(ICON_PATHS.check)
export const CloseIcon = strokeIcon(ICON_PATHS.close)
export const TrashIcon = strokeIcon(ICON_PATHS.trash)
export const ChevronRightIcon = strokeIcon(ICON_PATHS.chevronRight)
export const PlusIcon = strokeIcon(ICON_PATHS.plus)
export const CalendarIcon = strokeIcon(ICON_PATHS.calendar)
export const ChevronLeftIcon = strokeIcon(ICON_PATHS.chevronLeft)
export const PencilIcon = strokeIcon(ICON_PATHS.pencil)
export const ClockIcon = strokeIcon(ICON_PATHS.clock)
export const PlayIcon = filledIcon(ICON_PATHS.play)
export const GlobeIcon = strokeIcon(ICON_PATHS.globe)
export const RepeatIcon = strokeIcon(ICON_PATHS.repeat)
export const CaretDownIcon = filledIcon(ICON_PATHS.caretDown)
