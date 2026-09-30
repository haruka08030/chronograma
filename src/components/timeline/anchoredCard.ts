import type { CSSProperties } from 'react'

export interface AnchorRect {
  top: number
  left: number
  right: number
  bottom: number
}

export function rectOf(el: Element | null): AnchorRect | null {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { top: r.top, left: r.left, right: r.right, bottom: r.bottom }
}

const GAP = 8
const MARGIN = 12

/**
 * Google カレンダーのように、ブロックの横（右に入らなければ左）にカードを出す位置。
 * 狭い画面（スマホ）では下からのシートにする。
 */
export function anchoredCardStyle(anchor: AnchorRect, width: number, estHeight: number): { style: CSSProperties; sheet: boolean } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (vw < 640) {
    return { style: { left: 0, right: 0, bottom: 0 }, sheet: true }
  }
  let left = anchor.right + GAP
  let origin = 'left top'
  if (left + width > vw - MARGIN) {
    left = anchor.left - GAP - width
    origin = 'right top'
  }
  if (left < MARGIN) left = Math.max(MARGIN, Math.min(vw - width - MARGIN, anchor.left))
  const top = Math.max(MARGIN, Math.min(anchor.top, vh - estHeight - MARGIN))
  return { style: { left, top, width, transformOrigin: origin }, sheet: false }
}
