import { useLayoutEffect, type RefObject } from 'react'

/**
 * 入力欄の高さを中身に合わせる（中でスクロールさせない）。`rows`・`min-h` の高さより低くはしない。
 * `value` が変わるたび、`active`（編集に入った）になったときに測り直す。
 */
export function useAutoGrowTextarea(ref: RefObject<HTMLTextAreaElement | null>, value: string, active = true) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!active || !el) return
    el.style.height = 'auto'
    // border-box なので枠の分を足す
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`
  }, [ref, value, active])
}
