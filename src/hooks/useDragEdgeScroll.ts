import { useEffect, type RefObject } from 'react'

/** 端からこの距離に入ったらスクロールを始める */
const EDGE_PX = 48
/** 1 フレームで送る最大の量（端に近いほど速い） */
const MAX_STEP_PX = 16

/**
 * ドラッグ中、カーソルがスクロールする枠の上端・下端に近づいたら、その方向へ送る。
 * つかんだものの外の枠（例: To‑Do のナビ）は dnd-kit もブラウザも送ってくれないので、自分で送る。
 * dnd-kit のつかみ（pointermove）とネイティブ D&D（dragover）の両方のカーソル位置を拾う。
 * 送ったあとは `onScroll` で落とし先の位置を測り直させる。
 */
export function useDragEdgeScroll(ref: RefObject<HTMLElement | null>, active: boolean, onScroll?: () => void) {
  useEffect(() => {
    if (!active) return
    let x = -1
    let y = -1
    let frame = 0
    const track = (e: { clientX: number; clientY: number }) => {
      x = e.clientX
      y = e.clientY
    }
    const step = () => {
      const el = ref.current
      if (el && x >= 0) {
        const r = el.getBoundingClientRect()
        if (x >= r.left && x <= r.right) {
          const delta =
            y < r.top + EDGE_PX ? -Math.min(1, (r.top + EDGE_PX - y) / EDGE_PX) * MAX_STEP_PX
            : y > r.bottom - EDGE_PX ? Math.min(1, (y - (r.bottom - EDGE_PX)) / EDGE_PX) * MAX_STEP_PX
            : 0
          if (delta !== 0) {
            const before = el.scrollTop
            el.scrollTop = before + delta
            if (el.scrollTop !== before) onScroll?.()
          }
        }
      }
      frame = requestAnimationFrame(step)
    }
    window.addEventListener('pointermove', track)
    window.addEventListener('dragover', track)
    frame = requestAnimationFrame(step)
    return () => {
      window.removeEventListener('pointermove', track)
      window.removeEventListener('dragover', track)
      cancelAnimationFrame(frame)
    }
  }, [ref, active, onScroll])
}
