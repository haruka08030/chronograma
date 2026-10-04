import { useEffect, type RefObject } from 'react'

export const TOUCH_LONG_PRESS_MS = 450
/** これより指が動いたらスクロールとみなして長押しをやめる */
const SLOP_PX = 8

/**
 * タッチの長押しを右クリックとして扱う（`root` の中で長押しした所に contextmenu を送る）。
 * 右クリックのメニューを持つ所（予定・終日の予定・月のマスの項目）が、スマホでもそのまま長押しで開く。
 * - Android が自分で出す長押しの contextmenu は、こちらが出したあと同じ押し込みの間は止める（二重に開かない）
 * - 離したときの click は止める（カード・詳細が後ろで開かない）
 * - `skip(target)` が true の所（長押しで持ち上げるブロックなど）は扱わない
 */
export function useTouchContextMenu(root: RefObject<HTMLElement | null>, skip?: (target: Element) => boolean) {
  useEffect(() => {
    const el = root.current
    if (!el) return
    let press: { timer: number; x: number; y: number; target: Element } | null = null
    /** この押し込みで contextmenu を出したか（離すまで、OS の contextmenu と click を止める） */
    let fired = false

    const cancel = () => {
      if (press) window.clearTimeout(press.timer)
      press = null
    }
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || !e.isPrimary) return
      cancel()
      fired = false
      const target = e.target as Element
      if (skip?.(target)) return
      const { clientX: x, clientY: y } = e
      const timer = window.setTimeout(() => {
        press = null
        fired = true
        navigator.vibrate?.(15)
        target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y }))
      }, TOUCH_LONG_PRESS_MS)
      press = { timer, x, y, target }
    }
    const onMove = (e: PointerEvent) => {
      if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > SLOP_PX) cancel()
    }
    const onUp = () => {
      cancel()
      if (!fired) return
      // 離した直後の click だけ止める
      const stop = (ev: Event) => {
        ev.stopPropagation()
        ev.preventDefault()
      }
      window.addEventListener('click', stop, { capture: true, once: true })
      window.setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 400)
      fired = false
    }
    const onNativeMenu = (e: MouseEvent) => {
      // OS の長押しメニュー（Android）: 自分で出した後か、押している間は止める
      if (e.isTrusted && (fired || press)) {
        e.preventDefault()
        e.stopPropagation()
      }
    }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', cancel)
    el.addEventListener('contextmenu', onNativeMenu, { capture: true })
    return () => {
      cancel()
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', cancel)
      el.removeEventListener('contextmenu', onNativeMenu, { capture: true })
    }
    // skip は描画ごとに作り直されても、押し込みの間は最初のものでよい
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root])
}
