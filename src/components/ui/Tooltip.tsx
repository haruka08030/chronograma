import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/** マウスを乗せてから出るまで（Google カレンダーと同じく、通り過ぎただけでは出さない） */
const SHOW_DELAY_MS = 500
/** ボタンとの隙間・画面の端からの余白 */
const GAP = 6
const EDGE = 8

type Shown = { label: string; key: string | null; rect: DOMRect }

/** `tip()`（lib/tooltip）を付けた要素のヒントを出す。App に 1 つだけ置く。マウスのある PC だけ（タップでは出さない） */
export function TooltipHost() {
  const [shown, setShown] = useState<Shown | null>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canHover = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches
    if (!canHover) return
    let timer = 0
    let current: HTMLElement | null = null
    const hide = () => {
      window.clearTimeout(timer)
      current = null
      setShown(null)
    }
    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      const el = (e.target as Element | null)?.closest?.<HTMLElement>('[data-tip]') ?? null
      if (el === current) return
      hide()
      if (!el) return
      current = el
      timer = window.setTimeout(() => {
        if (current !== el || !el.isConnected) return
        setShown({ label: el.dataset.tip ?? '', key: el.dataset.tipKey ?? null, rect: el.getBoundingClientRect() })
      }, SHOW_DELAY_MS)
    }
    // 押した・打った・スクロールしたら消す（押したあとも出続けると操作の邪魔になる）
    document.addEventListener('pointerover', onOver, true)
    document.addEventListener('pointerdown', hide, true)
    document.addEventListener('keydown', hide, true)
    document.addEventListener('scroll', hide, true)
    window.addEventListener('blur', hide)
    return () => {
      hide()
      document.removeEventListener('pointerover', onOver, true)
      document.removeEventListener('pointerdown', hide, true)
      document.removeEventListener('keydown', hide, true)
      document.removeEventListener('scroll', hide, true)
      window.removeEventListener('blur', hide)
    }
  }, [])

  // 要素の下の中央に出す。下に入らなければ上に、左右ははみ出さないよう寄せる（大きさを測ってから置く）
  useLayoutEffect(() => {
    const el = bubbleRef.current
    if (!shown || !el) return
    const { rect } = shown
    const w = el.offsetWidth
    const h = el.offsetHeight
    const below = rect.bottom + GAP
    const top = below + h + EDGE <= window.innerHeight ? below : rect.top - GAP - h
    const left = Math.max(EDGE, Math.min(rect.left + rect.width / 2 - w / 2, window.innerWidth - w - EDGE))
    el.style.left = `${left}px`
    el.style.top = `${top}px`
    el.style.visibility = 'visible'
  }, [shown])

  if (!shown) return null
  return createPortal(
    <div
      ref={bubbleRef}
      role="tooltip"
      className="pointer-events-none fixed z-[100] flex items-center gap-1.5 whitespace-nowrap rounded-md bg-zinc-800 px-2 py-1 text-xs text-white shadow-md dark:bg-zinc-100 dark:text-zinc-900"
      style={{ left: 0, top: 0, visibility: 'hidden' }}
    >
      {shown.label}
      {shown.key && (
        <kbd className="rounded border border-white/25 px-1 font-mono text-[10px] leading-4 dark:border-zinc-900/25">
          {shown.key}
        </kbd>
      )}
    </div>,
    document.body,
  )
}
