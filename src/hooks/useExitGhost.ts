import { useCallback, type RefObject } from 'react'
import { EXIT_MS, prefersReducedMotion } from './usePresence'

/** 出る動き → 閉じる動き（同じ面の役割どうし） */
const EXIT_CLASS: Record<string, string> = {
  'animate-fade-in': 'animate-fade-out',
  'animate-pop-in': 'animate-pop-out',
  'animate-sheet-in': 'animate-sheet-out',
}

/**
 * 写しの中のスクロール位置・キャンバスの絵を元の面にそろえる（写すと 0・白紙になる）。
 * スクロール位置は写しを置いてからでないと効かないので、置いたあとに呼ぶ関数を返す
 */
function copyLiveState(from: Element, to: Element, later: (() => void)[] = []): (() => void)[] {
  const top = from.scrollTop
  const left = from.scrollLeft
  if (top || left)
    later.push(() => {
      to.scrollTop = top
      to.scrollLeft = left
    })
  if (from instanceof HTMLCanvasElement && to instanceof HTMLCanvasElement) {
    try {
      to.getContext('2d')?.drawImage(from, 0, 0)
    } catch {
      /* 描けなくても閉じる動きだけなので構わない */
    }
  }
  const a = from.children
  const b = to.children
  for (let i = 0; i < a.length && i < b.length; i++) copyLiveState(a[i], b[i], later)
  return later
}

/**
 * 閉じた面の写しを同じ所に残し、閉じる動き（背景は `animate-fade-out`、面は `animate-pop-out` / `animate-sheet-out`）を見せてから外す。
 * 呼び出し側が `{open && <Modal />}` のように外す面（ダイアログ・メニュー・ポップオーバー・予定カード）でも、
 * 呼び出し側を変えずに閉じる動きを付けるため。写しは `inert`（押せない・フォーカスしない・読み上げない）。
 * 出る動き（`animate-*-in`）の付いていない面・動きを減らす設定ではすぐ消える（写さない）。
 * 面が外れる直前（まだ画面にあるとき）に呼ぶ。実際に外れたときだけ写しを置く（開発時の StrictMode の付け外しでは置かない）
 */
export function exitGhost(el: HTMLElement | null) {
  const parent = el?.parentNode
  if (!el || !parent || prefersReducedMotion()) return
  const name = getComputedStyle(el).animationName
  if (!name || name === 'none') return
  const next = el.nextSibling
  const ghost = el.cloneNode(true) as HTMLElement
  for (const node of [ghost, ...ghost.querySelectorAll<HTMLElement>('[class]')]) {
    for (const [enter, exit] of Object.entries(EXIT_CLASS)) {
      if (node.classList.contains(enter)) node.classList.replace(enter, exit)
    }
  }
  for (const node of [ghost, ...ghost.querySelectorAll('[id]')]) node.removeAttribute('id')
  ghost.inert = true
  ghost.setAttribute('aria-hidden', 'true')
  ghost.setAttribute('data-exit-ghost', '')
  ghost.style.pointerEvents = 'none'
  const restore = copyLiveState(el, ghost)
  queueMicrotask(() => {
    if (el.isConnected || !parent.isConnected) return
    parent.insertBefore(ghost, next?.parentNode === parent ? next : null)
    for (const f of restore) f()
    window.setTimeout(() => ghost.remove(), EXIT_MS)
  })
}

/**
 * 閉じる動きを付ける面の一番外の要素（背景の幕があればそれ）に付ける ref（`exitGhost`）。
 * 面が外れるとき（呼び出し側が外した・開いている部品の中で閉じた）、外れる直前に写す。
 * `ref` を渡すと、その ref にも同じ要素をつなぐ（外側クリックの判定・フォーカスなどで使っている ref）
 */
export function useExitGhost<T extends HTMLElement>(ref?: RefObject<T | null>) {
  return useCallback(
    (el: T | null) => {
      if (ref) ref.current = el
      if (!el) return
      return () => {
        if (ref?.current === el) ref.current = null
        exitGhost(el)
      }
    },
    [ref],
  )
}
