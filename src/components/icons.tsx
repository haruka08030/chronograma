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
  /** アイコンだけで意味を伝えるとき（ボタンの中でない所）。読み上げる名前 */
  label?: string
}

/** 飾りなら読み上げない。`label` があれば画像として名前を読み上げる */
function a11y(label?: string) {
  return label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true }
}

function strokeIcon(d: string) {
  return function StrokeIcon({ className, style, strokeWidth = 2, label }: IconProps) {
    return (
      <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={strokeWidth} {...a11y(label)}>
        <path strokeLinecap="round" strokeLinejoin="round" d={d} />
      </svg>
    )
  }
}

function filledIcon(d: string) {
  return function FilledIcon({ className, style, label }: IconProps) {
    return (
      <svg className={className} style={style} fill="currentColor" viewBox="0 0 24 24" {...a11y(label)}>
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
export const CalendarArrowIcon = strokeIcon(ICON_PATHS.calendarArrow)
export const ChevronLeftIcon = strokeIcon(ICON_PATHS.chevronLeft)
export const PencilIcon = strokeIcon(ICON_PATHS.pencil)
export const ClockIcon = strokeIcon(ICON_PATHS.clock)
export const PlayIcon = filledIcon(ICON_PATHS.play)
export const GlobeIcon = strokeIcon(ICON_PATHS.globe)
export const RepeatIcon = strokeIcon(ICON_PATHS.repeat)
export const CaretDownIcon = filledIcon(ICON_PATHS.caretDown)
export const ArchiveIcon = strokeIcon(ICON_PATHS.archive)
export const FlagIcon = strokeIcon(ICON_PATHS.flag)
export const ArrowRightIcon = strokeIcon(ICON_PATHS.arrowRight)
export const SearchIcon = strokeIcon(ICON_PATHS.search)
export const OpenPanelIcon = strokeIcon(ICON_PATHS.openPanel)
export const SunIcon = strokeIcon(ICON_PATHS.sun)
export const CheckCircleIcon = strokeIcon(ICON_PATHS.checkCircle)
export const MenuIcon = strokeIcon(ICON_PATHS.menu)
export const MoonSolidIcon = filledIcon(ICON_PATHS.moonSolid)
export const MapPinIcon = strokeIcon(ICON_PATHS.mapPin)
export const ExternalLinkIcon = strokeIcon(ICON_PATHS.externalLink)
export const ListBulletIcon = strokeIcon(ICON_PATHS.listBullet)
export const SortIcon = strokeIcon(ICON_PATHS.sort)
export const MoonIcon = strokeIcon(ICON_PATHS.moon)
export const SunBrightIcon = strokeIcon(ICON_PATHS.sunBright)
export const StarIcon = strokeIcon(ICON_PATHS.star)
export const CartIcon = strokeIcon(ICON_PATHS.cart)
export const PencilSquareIcon = strokeIcon(ICON_PATHS.pencilSquare)
export const ChevronUpIcon = strokeIcon(ICON_PATHS.chevronUp)
export const ChevronDownIcon = strokeIcon(ICON_PATHS.chevronDown)
export const SectionIcon = strokeIcon(ICON_PATHS.section)
