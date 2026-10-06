import { useEffect, useRef, type RefObject } from 'react'
import { isLiftActive } from '../lib/touchLift'

/** 横に動いたと決めるまでの距離（これより前に縦へ動いたらスクロールとして任せる） */
const LOCK_PX = 10
/** 前後へ送るのに要る距離 */
const COMMIT_PX = 60
/** 速く払ったときは短くても送る（px/ms） */
const COMMIT_VELOCITY = 0.4
/** 送った後、新しい中身を払った向きからこの距離だけ滑り込ませる */
const SLIDE_IN_PX = 40

/**
 * タッチの横スワイプで前後へ送る（Google カレンダーと同じ）。指に合わせて中身を横にずらし、離したら送る・戻す。
 * 横と決まるまでは何もしないので縦スクロールの邪魔をしない。2 本指（ピンチ）・`isBlocked()` が true のとき（ドラッグ中など）・
 * 長押しで行を浮かせている間（`isLiftActive`）は無視する。
 * `dir` は -1 = 前（右へ払う）、1 = 次（左へ払う）。
 * `follow: false` は中身を動かさず、払ったことだけを知らせる（To-Do で右へ払ってドロワーを出すときなど）
 */
export function useSwipeNav(
  ref: RefObject<HTMLElement | null>,
  onSwipe: ((dir: -1 | 1) => void) | undefined,
  isBlocked?: () => boolean,
  { follow = true }: { follow?: boolean } = {},
) {
  const onSwipeRef = useRef(onSwipe)
  const isBlockedRef = useRef(isBlocked)
  useEffect(() => {
    onSwipeRef.current = onSwipe
    isBlockedRef.current = isBlocked
  })
  const enabled = !!onSwipe

  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return
    let start: { x: number; y: number; t: number } | null = null
    let axis: 'x' | 'y' | null = null
    let dx = 0

    const setShift = (px: number, animate: boolean) => {
      if (!follow) return
      el.style.transition = animate ? 'transform 180ms var(--ease-standard)' : ''
      el.style.transform = px ? `translateX(${px}px)` : ''
    }
    const reset = () => {
      start = null
      axis = null
      dx = 0
    }

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || isBlockedRef.current?.() || isLiftActive()) {
        if (axis === 'x') setShift(0, true)
        reset()
        return
      }
      const t = e.touches[0]!
      start = { x: t.clientX, y: t.clientY, t: e.timeStamp }
      axis = null
      dx = 0
    }
    const onMove = (e: TouchEvent) => {
      if (!start || e.touches.length !== 1) return
      if (isBlockedRef.current?.() || isLiftActive()) {
        if (axis === 'x') setShift(0, true)
        reset()
        return
      }
      const t = e.touches[0]!
      const mx = t.clientX - start.x
      const my = t.clientY - start.y
      if (!axis) {
        if (Math.abs(mx) < LOCK_PX && Math.abs(my) < LOCK_PX) return
        axis = Math.abs(mx) > Math.abs(my) * 1.5 ? 'x' : 'y'
      }
      if (axis !== 'x') return
      // 横と決めたら縦スクロールを止める（指が斜めにぶれても画面が上下しない）
      if (e.cancelable) e.preventDefault()
      dx = mx
      setShift(mx * 0.5, false)
    }
    const onEnd = (e: TouchEvent) => {
      if (!start || axis !== 'x') {
        reset()
        return
      }
      const velocity = Math.abs(dx) / Math.max(1, e.timeStamp - start.t)
      const commit = Math.abs(dx) >= COMMIT_PX || (Math.abs(dx) >= LOCK_PX * 2 && velocity >= COMMIT_VELOCITY)
      const dir: -1 | 1 = dx < 0 ? 1 : -1
      reset()
      if (!commit) {
        setShift(0, true)
        return
      }
      onSwipeRef.current?.(dir)
      // 新しい中身を払った向きの先から滑り込ませる
      setShift(dir * SLIDE_IN_PX, false)
      requestAnimationFrame(() => requestAnimationFrame(() => setShift(0, true)))
    }
    const onCancel = () => {
      if (axis === 'x') setShift(0, true)
      reset()
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onCancel)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onCancel)
      setShift(0, false)
    }
  }, [ref, enabled, follow])
}
