import { useLayoutEffect, useRef, type RefObject } from 'react'
import { fitRect, type FitOptions, type Rect } from '../lib/viewportFit'

export interface UseFitOptions extends Omit<FitOptions, 'anchor'> {
  /** 開いた所。要素に付いていく面（スクロールしても欄の下に出す）は、測り直す関数で渡す */
  anchor: Rect | (() => Rect | null) | null
  /** 置かない（スマホの下からのシートなど、CSS で置く面） */
  disabled?: boolean
  /** 変わったら置き直す値（開いた所が別の項目に変わったときなど） */
  watch?: unknown
}

/**
 * `position: fixed` の面を `fitRect` で画面の中に置き、開いた後に中身が伸びても（色パレットを開く・候補が増える）、
 * 画面の大きさ・キーボードが変わっても置き直す。入らない分は面の中でスクロール。
 * 位置は DOM に直に書く（描く前に測って置くので、はみ出した位置が一瞬見えることもない）
 */
export function useFitInViewport(ref: RefObject<HTMLElement | null>, options: UseFitOptions): void {
  const opts = useRef(options)
  // 置く効果より先に最新にする（効果は書いた順に走る）
  useLayoutEffect(() => {
    opts.current = options
  })
  const { disabled, placement, prefer, align, watch } = options
  // 関数で渡す anchor は描くたびに作り直されてよい（中で最新のものを呼ぶ）
  const anchorKey = typeof options.anchor === 'function' ? 'follow' : JSON.stringify(options.anchor)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || disabled) return
    const apply = () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { anchor, disabled: _d, watch: _w, ...rest } = opts.current
      const rect = typeof anchor === 'function' ? anchor() : anchor
      if (!rect) return
      // scrollHeight は上限（maxHeight）で止まっていても中身の高さを返す
      const fit = fitRect({ width: el.offsetWidth, height: el.scrollHeight }, { ...rest, anchor: rect })
      el.style.left = `${fit.left}px`
      el.style.top = `${fit.top}px`
      el.style.bottom = ''
      el.style.right = ''
      el.style.maxHeight = `${fit.maxHeight}px`
      el.style.overflowY = 'auto'
      el.style.transformOrigin = fit.transformOrigin
    }
    apply()

    let frame = 0
    const later = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(apply)
    }
    // 中身の大きさが変わったら置き直す。面は上限で止まるので、子の大きさを見る
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(later)
    const observeChildren = () => {
      if (!ro) return
      ro.disconnect()
      ro.observe(el)
      for (const child of Array.from(el.children)) ro.observe(child)
    }
    observeChildren()
    const mo =
      typeof MutationObserver === 'undefined'
        ? null
        : new MutationObserver(() => {
            observeChildren()
            later()
          })
    mo?.observe(el, { childList: true, subtree: true })

    const follows = typeof opts.current.anchor === 'function'
    const onScroll = (e: Event) => {
      if (e.target instanceof Node && el.contains(e.target)) return
      later()
    }
    window.addEventListener('resize', later)
    window.visualViewport?.addEventListener('resize', later)
    if (follows) window.addEventListener('scroll', onScroll, true)
    return () => {
      cancelAnimationFrame(frame)
      ro?.disconnect()
      mo?.disconnect()
      window.removeEventListener('resize', later)
      window.visualViewport?.removeEventListener('resize', later)
      if (follows) window.removeEventListener('scroll', onScroll, true)
    }
  }, [ref, disabled, placement, prefer, align, anchorKey, watch])
}
