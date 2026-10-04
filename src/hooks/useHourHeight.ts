import { useEffect, useSyncExternalStore, type RefObject } from 'react'
import { HOUR_HEIGHT, setHourHeight, subscribeHourHeight } from '../lib/timeGrid'

/** 1 時間の高さ（px）。ピンチで変わったら描き直す */
export function useHourHeight(): number {
  return useSyncExternalStore(subscribeHourHeight, () => HOUR_HEIGHT)
}

/**
 * タイムラインを 2 本指でつまむと 1 時間の高さを変える（Google カレンダーと同じ）。上下の指の間隔で決め、
 * 指の真ん中の時刻が指の下に残るようスクロールも合わせる。始めたら、1 本指で始めていたドラッグ・長押しはやめる（`onStart`）
 */
export function usePinchHourHeight(scrollRef: RefObject<HTMLElement | null>, onStart?: () => void) {
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let pinch: { gap: number; height: number; hoursAtMid: number } | null = null
    const gapOf = (e: TouchEvent) => Math.max(20, Math.abs(e.touches[0]!.clientY - e.touches[1]!.clientY))
    const midOf = (e: TouchEvent) => (e.touches[0]!.clientY + e.touches[1]!.clientY) / 2 - el.getBoundingClientRect().top

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return
      onStart?.()
      pinch = { gap: gapOf(e), height: HOUR_HEIGHT, hoursAtMid: (el.scrollTop + midOf(e)) / HOUR_HEIGHT }
    }
    const onTouchMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return
      if (e.cancelable) e.preventDefault()
      const { gap, height, hoursAtMid } = pinch
      const mid = midOf(e)
      setHourHeight(height * (gapOf(e) / gap))
      // 描き直して高さが変わってから、つまんだ時刻を指の下へ
      requestAnimationFrame(() => {
        el.scrollTop = hoursAtMid * HOUR_HEIGHT - mid
      })
    }
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = null
    }
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [scrollRef, onStart])
}
