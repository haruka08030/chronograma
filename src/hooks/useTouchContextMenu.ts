import { useEffect, useRef, type RefObject } from 'react'

export const TOUCH_LONG_PRESS_MS = 450
/** これより指が動いたらスクロールとみなして長押しをやめる */
const SLOP_PX = 8

/** 長押しを離した直後に来る click を 1 回だけ止める（後ろのカード・詳細を開かない） */
export function suppressNextClick() {
  const stop = (ev: Event) => {
    ev.stopPropagation()
    ev.preventDefault()
  }
  window.addEventListener('click', stop, { capture: true, once: true })
  window.setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 400)
}

/**
 * タッチの長押しを右クリックとして扱う（`root` の中で長押しした所に contextmenu を送る）。
 * 右クリックのメニューを持つ所（予定・終日の予定・月のマスの項目）が、スマホでもそのまま長押しで開く。
 * - Android が自分で出す長押しの contextmenu は、こちらが出したあと同じ押し込みの間は止める（二重に開かない）
 * - 離したときの click は止める（カード・詳細が後ろで開かない）
 * - `skip(target)` が true の所（長押しで持ち上げるブロックなど）は扱わない。長押しが成立した時点で見る（押した瞬間はまだ他の pointerdown が動いていない）
 */
export function useTouchContextMenu(root: RefObject<HTMLElement | null>, skip?: (target: Element) => boolean) {
  const skipRef = useRef(skip)
  useEffect(() => {
    skipRef.current = skip
  })
  useEffect(() => {
    const el = root.current
    if (!el) return
    let press: { timer: number; x: number; y: number; target: Element } | null = null
    /** この押し込みで contextmenu を出したか（離すまで click を止める） */
    let fired = false
    /** タッチで押している間（OS の長押しの contextmenu を止める） */
    let touching = false

    const cancel = () => {
      if (press) window.clearTimeout(press.timer)
      press = null
    }
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || !e.isPrimary) return
      cancel()
      fired = false
      touching = true
      const target = e.target as Element
      const { clientX: x, clientY: y } = e
      const timer = window.setTimeout(() => {
        press = null
        if (skipRef.current?.(target)) return
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
      touching = false
      if (!fired) return
      suppressNextClick()
      fired = false
    }
    const onNativeMenu = (e: MouseEvent) => {
      // OS の長押しメニュー（Android）: 自分で出した後か、押している間は止める
      if (e.isTrusted && touching) {
        e.preventDefault()
        e.stopPropagation()
      }
    }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    const onCancel = () => {
      cancel()
      touching = false
    }
    el.addEventListener('pointercancel', onCancel)
    el.addEventListener('contextmenu', onNativeMenu, { capture: true })
    return () => {
      cancel()
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onCancel)
      el.removeEventListener('contextmenu', onNativeMenu, { capture: true })
    }
  }, [root])
}
