import { type CSSProperties, type RefObject } from 'react'
import { useFitInViewport } from '../../hooks/useFitInViewport'

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

/** スマホ幅ではカードを下からのシートにする */
export const isAnchoredSheet = () => window.innerWidth < 640

/** 下からのシート。背の上限は `anchoredCardClass` */
const SHEET_STYLE: CSSProperties = { left: 0, right: 0, bottom: 0 }

/**
 * Google カレンダーのように、ブロックの横（右に入らなければ左）にカードを出す。
 * 実際の大きさを測って画面の中に置き、開いた後に背が伸びても（色の一覧・時刻の欄）置き直す。入らない分はカードの中でスクロール。
 * 狭い画面（スマホ）では下からのシートにする。
 */
export function useAnchoredCard(
  ref: RefObject<HTMLElement | null>,
  anchor: AnchorRect,
  width: number,
): { style: CSSProperties; sheet: boolean } {
  const sheet = isAnchoredSheet()
  useFitInViewport(ref, { anchor, placement: 'side', gap: GAP, edge: MARGIN, disabled: sheet })
  return { style: sheet ? SHEET_STYLE : { width }, sheet }
}
