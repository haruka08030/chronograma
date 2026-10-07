import { useCallback, useRef } from 'react'

export const LONG_PRESS_MS = 450
/** これより指が動いたらスクロールとみなして長押しをやめる */
const LONG_PRESS_SLOP_PX = 8

/**
 * タッチの長押し（行は浮かせて選択に入れる `useRowLift`、習慣のカードは右クリックと同じメニュー）。マウスでは何もしない。
 * - `pointerHandlers` を行に付ける
 * - `onClickCapture` を行に付けると、長押しの直後の click（詳細・編集を開く）を止める
 * - `isPressing()` が true の間に来る contextmenu は OS の長押しメニューなので抑える
 */
export function useLongPress(onLongPress: (e: React.PointerEvent) => void, enabled = true) {
  const pressRef = useRef<{ timer: number; x: number; y: number } | null>(null)
  const suppressClickRef = useRef(false)
  const cancel = useCallback(() => {
    if (pressRef.current) window.clearTimeout(pressRef.current.timer)
    pressRef.current = null
  }, [])
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch' || !enabled) return
    const timer = window.setTimeout(() => {
      pressRef.current = null
      suppressClickRef.current = true
      navigator.vibrate?.(15)
      onLongPress(e)
    }, LONG_PRESS_MS)
    pressRef.current = { timer, x: e.clientX, y: e.clientY }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const p = pressRef.current
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > LONG_PRESS_SLOP_PX) cancel()
  }
  const onClickCapture = (e: React.MouseEvent) => {
    if (!suppressClickRef.current) return
    suppressClickRef.current = false
    e.stopPropagation()
    e.preventDefault()
  }
  return {
    pointerHandlers: { onPointerDown, onPointerMove, onPointerUp: cancel, onPointerCancel: cancel },
    onClickCapture,
    isPressing: () => suppressClickRef.current || pressRef.current !== null,
  }
}
