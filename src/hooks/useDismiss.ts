import { useEffect, useRef, type RefObject } from 'react'
import { useEscapeLayer, type HotkeyLayer } from './useHotkey'
import { swallowPress } from '../lib/swallowPress'

type Inside = RefObject<Element | null> | Element | null

const resolve = (x: Inside) => (x && 'current' in x ? x.current : x)

type Entry = {
  /** この押下で閉じるか */
  isOutside: (target: Node) => boolean
  close: () => void
  /** 閉じた押下を下に届けないか */
  swallow: () => boolean
  /** 開いた押下が終わってから拾う */
  armed: boolean
}

/** 開いている面（開いた順）。外の押下で閉じるのは一番上の 1 枚だけ */
const stack: Entry[] = []

function onPointerDown(e: PointerEvent) {
  const top = stack.at(-1)
  if (!top?.armed || !(e.target instanceof Node) || !top.isOutside(e.target)) return
  // シート・背景のある面は閉じるだけ（下のボタン・行には押下もクリックも届けない）
  if (top.swallow()) swallowPress(e)
  top.close()
}

let listening = false

/**
 * 開いているシート・ポップオーバー・メニュー・カードを「外側を押す」か Esc で閉じる。どれも同じ閉じ方にする。
 * - 重なっているときは一番上の 1 枚だけを閉じる（Esc と同じ）
 * - 下からのシート（`swallow`）・全面の背景のある面（`backdrop`）は、外を押すと閉じるだけで、その押下は下のボタン・行・タイムラインに届かない
 *   （クリック・長押し・ドラッグも始まらない。`swallowPress`）。PC の小さなカード・メニューは閉じて、押下はそのまま下へ通す（別の予定を押すとそのカードに替わる）
 * - `inside` に入れた要素（中身・開くボタン）の中を押しても閉じない
 * - `data-popover-keep` の付いた所（上に重ねたダイアログなど）も内側とみなす
 * - `backdrop` を渡すと、その背景（`inside` を除く）を押したときだけ閉じる（全面を覆うシート・ダイアログ。上に出た知らせなどを押しても閉じない）
 * - 開いたその押下では閉じないよう、次のタイミングから拾う
 * - Esc は一番上の層だけを閉じる（`useEscapeLayer`）。Esc だけ別の閉じ方（書いた分を捨てる）にするときは `onEscape`
 * - 返す層を `useHotkey` の scope に渡すと、その面が一番上のときだけ効くキーになる
 */
export function useDismiss({
  open,
  onClose,
  inside,
  backdrop,
  swallow = false,
  onEscape,
}: {
  open: boolean
  onClose: () => void
  inside: Inside[]
  /** 全面を覆う背景（これを押したときだけ閉じる） */
  backdrop?: Inside
  /** 外の押下を下に届けない（下からのシートのとき true。押した時に読む関数でもよい）。`backdrop` があれば常に止める */
  swallow?: boolean | (() => boolean)
  /** Esc で閉じるとき（省略時は `onClose`）。外を押したら保存・Esc は取り消し、のカードで使う */
  onEscape?: () => void
}): HotkeyLayer {
  const closeRef = useRef(onClose)
  const insideRef = useRef(inside)
  const backdropRef = useRef(backdrop)
  const swallowRef = useRef(swallow)
  useEffect(() => {
    closeRef.current = onClose
    insideRef.current = inside
    backdropRef.current = backdrop
    swallowRef.current = swallow
  })

  const layer = useEscapeLayer(onEscape ?? onClose, open)

  useEffect(() => {
    if (!open) return
    const entry: Entry = {
      isOutside: (target) => {
        if (insideRef.current.some((x) => resolve(x)?.contains(target))) return false
        if (backdropRef.current !== undefined) return resolve(backdropRef.current)?.contains(target) ?? false
        return !(target as Element).closest?.('[data-popover-keep]')
      },
      close: () => closeRef.current(),
      swallow: () => {
        const x = swallowRef.current
        return backdropRef.current !== undefined || (typeof x === 'function' ? x() : x)
      },
      armed: false,
    }
    stack.push(entry)
    if (!listening) {
      listening = true
      window.addEventListener('pointerdown', onPointerDown, true)
    }
    const id = window.setTimeout(() => (entry.armed = true), 0)
    return () => {
      window.clearTimeout(id)
      const i = stack.indexOf(entry)
      if (i >= 0) stack.splice(i, 1)
    }
  }, [open])
  return layer
}
