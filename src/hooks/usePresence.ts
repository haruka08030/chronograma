import { useEffect, useState } from 'react'

/** 閉じる動き（`animate-*-out`、150ms）を見せ終わるまで残しておく長さ */
export const EXIT_MS = 160

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/**
 * 閉じた（`value` が null になった）あとも `EXIT_MS` だけ前の値を返し、その間 `closing` を true にする。
 * 閉じる面を消える動きのあとで外すため（いきなり消えると何が閉じたか目で追えない）。
 * `value` は描画のたびに作り直さない値にする（文字列・store の物・true など）。作り直すと描画が止まらない。
 * 動きを減らす設定のときは待たずに外す。
 */
export function usePresence<T>(value: T | null): { shown: T | null; closing: boolean } {
  const [last, setLast] = useState<T | null>(value)
  if (value !== null && value !== last) setLast(value)
  const closing = value === null && last !== null

  useEffect(() => {
    if (!closing) return
    const timer = window.setTimeout(() => setLast(null), prefersReducedMotion() ? 0 : EXIT_MS)
    return () => window.clearTimeout(timer)
  }, [closing])

  return { shown: value ?? last, closing }
}
