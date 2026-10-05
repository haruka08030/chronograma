import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'

/** 横に動いたと決めるまでの距離（これより前に縦へ動いたらスクロールとして任せる。useSwipeNav と同じ） */
const LOCK_PX = 10
/** 離したら実行する距離 */
const COMMIT_PX = 88

export type RowSwipeAction = {
  label: string
  icon: ReactNode
  /** done = 完了（緑）、date = 日付の付け替え（青） */
  tone: 'done' | 'date'
  run: () => void
}

/** 色はベタ塗りにせず薄い塗り。離せば実行する所まで来たら一段濃くする */
const TONE: Record<RowSwipeAction['tone'], { idle: string; armed: string }> = {
  done: {
    idle: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
    armed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/25 dark:text-emerald-300',
  },
  date: {
    idle: 'bg-date-50 text-date-600 dark:bg-date-500/10 dark:text-date-400',
    armed: 'bg-date-100 text-date-700 dark:bg-date-500/25 dark:text-date-300',
  },
}

/**
 * タッチで行を横に払う操作（今日の計画・To-Do の行で共通）。右へ払うと `right`（完了）、左へ払うと `left`（今日やる・明日へ）。
 * 指に合わせて行がずれ、下から何をするかが見える。COMMIT_PX を越えて離すと実行する。
 * 行の上では、その向きに操作があれば画面の横スワイプ（To-Do のドロワー）より先に取る。操作がない向きはそのまま画面へ渡す。
 * 呼ぶ側は行を `relative` な箱で包み、`backdrop` を行の前に置く。払っている間は行に `swipingClass`（下が透けない地の色）を付ける
 */
export function useRowSwipe(
  rowRef: RefObject<HTMLElement | null>,
  { right, left }: { right?: RowSwipeAction; left?: RowSwipeAction },
  enabled = true,
) {
  const [side, setSide] = useState<'right' | 'left' | null>(null)
  const [armed, setArmed] = useState(false)
  const actionsRef = useRef({ right, left })
  useEffect(() => {
    actionsRef.current = { right, left }
  })
  /** 払った直後の click（行を押した扱い）を止める */
  const suppressClickRef = useRef(false)

  useEffect(() => {
    const el = rowRef.current
    if (!el || !enabled) return
    let start: { x: number; y: number } | null = null
    let axis: 'x' | 'y' | null = null
    let dx = 0

    const shift = (px: number, animate: boolean) => {
      el.style.transition = animate ? 'transform 180ms var(--ease-standard)' : ''
      el.style.transform = px ? `translateX(${px}px)` : ''
    }
    const reset = () => {
      start = null
      axis = null
      dx = 0
      setSide(null)
      setArmed(false)
    }

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      const t = e.touches[0]!
      start = { x: t.clientX, y: t.clientY }
      axis = null
      dx = 0
    }
    const onMove = (e: TouchEvent) => {
      if (!start || e.touches.length !== 1) return
      const t = e.touches[0]!
      const mx = t.clientX - start.x
      const my = t.clientY - start.y
      if (!axis) {
        if (Math.abs(mx) < LOCK_PX && Math.abs(my) < LOCK_PX) return
        const horizontal = Math.abs(mx) > Math.abs(my) * 1.5
        // その向きに操作がなければ行では取らない（画面の横スワイプに任せる）
        const action = mx > 0 ? actionsRef.current.right : actionsRef.current.left
        axis = horizontal && action ? 'x' : 'y'
      }
      if (axis !== 'x') return
      e.stopPropagation()
      if (e.cancelable) e.preventDefault()
      // 操作のない向きへは戻るだけ（行が反対へずれない）
      const action = mx > 0 ? actionsRef.current.right : actionsRef.current.left
      dx = action ? mx : 0
      shift(dx, false)
      setSide(dx > 0 ? 'right' : dx < 0 ? 'left' : null)
      setArmed(Math.abs(dx) >= COMMIT_PX)
    }
    const onEnd = (e: TouchEvent) => {
      if (axis !== 'x') {
        start = null
        axis = null
        return
      }
      e.stopPropagation()
      suppressClickRef.current = true
      window.setTimeout(() => {
        suppressClickRef.current = false
      }, 400)
      const action = dx > 0 ? actionsRef.current.right : actionsRef.current.left
      const commit = Math.abs(dx) >= COMMIT_PX && action
      shift(0, true)
      reset()
      if (commit) {
        navigator.vibrate?.(10)
        action.run()
      }
    }
    const onCancel = () => {
      if (axis === 'x') shift(0, true)
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
      shift(0, false)
    }
  }, [rowRef, enabled])

  const action = side === 'right' ? right : side === 'left' ? left : undefined
  const backdrop = action ? (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 flex items-center gap-2 rounded-[inherit] px-5 text-sm font-medium transition-colors
                  ${side === 'right' ? 'justify-start' : 'justify-end'} ${armed ? TONE[action.tone].armed : TONE[action.tone].idle}`}
    >
      {action.icon}
      {action.label}
    </div>
  ) : null

  return {
    backdrop,
    swipingClass: side ? 'bg-white dark:bg-zinc-900' : '',
    onClickCapture: (e: React.MouseEvent) => {
      if (!suppressClickRef.current) return
      suppressClickRef.current = false
      e.stopPropagation()
      e.preventDefault()
    },
  }
}
