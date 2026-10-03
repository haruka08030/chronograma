import { useEffect, useRef, type RefObject } from 'react'
import { useEscapeLayer, type HotkeyLayer } from './useHotkey'

type Inside = RefObject<Element | null> | Element | null

/**
 * 開いているポップオーバー・メニュー・カードを「外側を押す」か Esc で閉じる。どれも同じ閉じ方にする。
 * - `inside` に入れた要素（中身・開くボタン）の中を押しても閉じない
 * - `data-popover-keep` の付いた所（上に重ねたダイアログなど）も内側とみなす
 * - 開いたその押下では閉じないよう、次のタイミングから拾う
 * - Esc は一番上の層だけを閉じる（`useEscapeLayer`）。Esc だけ別の閉じ方（書いた分を捨てる）にするときは `onEscape`
 * - 返す層を `useHotkey` の scope に渡すと、その面が一番上のときだけ効くキーになる
 */
export function useDismiss({
  open,
  onClose,
  inside,
  onEscape,
}: {
  open: boolean
  onClose: () => void
  inside: Inside[]
  /** Esc で閉じるとき（省略時は `onClose`）。外を押したら保存・Esc は取り消し、のカードで使う */
  onEscape?: () => void
}): HotkeyLayer {
  const closeRef = useRef(onClose)
  const insideRef = useRef(inside)
  useEffect(() => {
    closeRef.current = onClose
    insideRef.current = inside
  })

  const layer = useEscapeLayer(onEscape ?? onClose, open)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      for (const x of insideRef.current) {
        const el = x && 'current' in x ? x.current : x
        if (el?.contains(target)) return
      }
      if ((target as Element).closest?.('[data-popover-keep]')) return
      closeRef.current()
    }
    const id = window.setTimeout(() => window.addEventListener('pointerdown', onDown, true), 0)
    return () => {
      window.clearTimeout(id)
      window.removeEventListener('pointerdown', onDown, true)
    }
  }, [open])
  return layer
}
