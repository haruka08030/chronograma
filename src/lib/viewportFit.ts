/**
 * 浮かせて出す面（カード・メニュー・色パレット・日時の候補）を、必ず見えている画面の中に置く計算。
 * 入らない分は面の中でスクロールさせる（`maxHeight`）。スクロールもタップもできない所には出さない。
 * DOM に置くのは `useFitInViewport`。
 */

export interface Rect {
  top: number
  bottom: number
  left: number
  right: number
}

/** 画面の端から空ける幅 */
export const VIEWPORT_EDGE = 8

/** 見えている範囲。スマホでキーボードが出ているときは visualViewport で測る */
export function viewportBox(): Rect {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null
  const top = vv?.offsetTop ?? 0
  const left = vv?.offsetLeft ?? 0
  return {
    top,
    left,
    bottom: top + (vv?.height || window.innerHeight),
    right: left + (vv?.width || window.innerWidth),
  }
}

/** 押した点（右クリック・タップの位置）を大きさ 0 の四角にする */
export const pointRect = (x: number, y: number): Rect => ({ top: y, bottom: y, left: x, right: x })

export interface FitOptions {
  /** 開いた所 */
  anchor: Rect
  /**
   * below: 下に（入らなければ上に）。ドロップダウン・右クリックのメニュー
   * side: 横に（右、入らなければ左）。縦は開いた所の上端にそろえる。タイムラインの予定のカード・中のメニュー
   */
  placement: 'below' | 'side'
  /** below のとき先に試す向き */
  prefer?: 'below' | 'above'
  /** below のとき横のそろえ方 */
  align?: 'start' | 'end' | 'center'
  /** 開いた所との間 */
  gap?: number
  edge?: number
}

export interface Fit {
  left: number
  top: number
  /** 面の高さの上限。中身がこれより高ければ面の中でスクロール */
  maxHeight: number
  transformOrigin: string
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max))

/** 中身の大きさ（width × height）の面を置く位置。必ず `vp` の中に入る */
export function fitRect(size: { width: number; height: number }, opts: FitOptions, vp: Rect = viewportBox()): Fit {
  const { anchor, placement, prefer = 'below', align = 'start', gap = 4, edge = VIEWPORT_EDGE } = opts
  const minTop = vp.top + edge
  const maxBottom = vp.bottom - edge
  const minLeft = vp.left + edge
  const maxLeftFor = (w: number) => Math.max(minLeft, vp.right - edge - w)
  const avail = Math.max(0, maxBottom - minTop)

  if (placement === 'side') {
    let left = anchor.right + gap
    let originX = 'left'
    if (left + size.width > vp.right - edge && anchor.left - gap - size.width >= minLeft) {
      left = anchor.left - gap - size.width
      originX = 'right'
    }
    left = clamp(left, minLeft, maxLeftFor(size.width))
    const top = clamp(anchor.top, minTop, Math.max(minTop, maxBottom - size.height))
    return { left, top, maxHeight: maxBottom - top, transformOrigin: `${originX} top` }
  }

  const rawLeft =
    align === 'end' ? anchor.right - size.width : align === 'center' ? (anchor.left + anchor.right - size.width) / 2 : anchor.left
  const left = clamp(rawLeft, minLeft, maxLeftFor(size.width))
  const belowTop = anchor.bottom + gap
  const aboveBottom = anchor.top - gap
  const fitsBelow = belowTop + size.height <= maxBottom
  const fitsAbove = aboveBottom - size.height >= minTop
  const down = prefer === 'below' ? fitsBelow || !fitsAbove : !fitsAbove && fitsBelow
  if (down && fitsBelow) return { left, top: belowTop, maxHeight: maxBottom - belowTop, transformOrigin: 'top' }
  if (!down && fitsAbove) {
    const top = aboveBottom - size.height
    return { left, top, maxHeight: aboveBottom - top, transformOrigin: 'bottom' }
  }
  // どちらにも入らない: 画面の中に寄せる（開いた所に重なってよい）。それでも高ければ面の中でスクロール
  const top = clamp(belowTop, minTop, Math.max(minTop, maxBottom - size.height))
  return { left, top, maxHeight: Math.min(avail, maxBottom - top), transformOrigin: 'top' }
}
