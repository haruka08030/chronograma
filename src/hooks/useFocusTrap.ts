import { useCallback, useEffect, useRef, type KeyboardEvent, type RefObject } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'

/**
 * 重ねて開く面（ダイアログ・タスク詳細・スマホのドロワー）のフォーカスの扱い。
 * - 開いたら面（か `initialFocus`）にフォーカスし、閉じたら開く前の場所に戻す
 * - 戻す先が無い（行の余白を押して開いた、など BODY だった）ときは `returnFocus` の要素へ
 * - 返す関数を面の外枠の `onKeyDown` に付けると、Tab / Shift+Tab が面の中だけを巡回する
 *
 * `active` が false になった時点（閉じる動きの始まり）で戻す。動きのあいだ残る面（`usePresence`）でも、
 * 消えるのを待たずに元の行へ戻る。閉じる間に別の所を押していたら（フォーカスが面の外にある）奪わない
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  {
    active = true,
    initialFocus,
    returnFocus,
  }: {
    active?: boolean
    /** 開いたときにフォーカスする要素（省略すると面そのもの。面に tabIndex={-1} を付ける） */
    initialFocus?: RefObject<HTMLElement | null>
    /** 開く前のフォーカスが BODY だったときに戻す先 */
    returnFocus?: () => HTMLElement | null | undefined
  } = {},
) {
  // 開いた時点の値で動かす（開いている間に変わっても、最新の returnFocus を使う）
  const options = useRef({ initialFocus, returnFocus })
  useEffect(() => {
    options.current = { initialFocus, returnFocus }
  })

  useEffect(() => {
    if (!active) return
    const container = ref.current
    const prev = document.activeElement as HTMLElement | null
    ;(options.current.initialFocus?.current ?? container)?.focus()
    return () => {
      const now = document.activeElement
      if (now && now !== document.body && container && !container.contains(now)) return
      const back = prev && prev !== document.body && prev.isConnected ? prev : options.current.returnFocus?.()
      back?.focus?.()
    }
  }, [active, ref])

  return useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Tab' && ref.current) trapTab(e, ref.current)
    },
    [ref],
  )
}

/** フォーカスが面の端に来たら反対の端へ回す（背景の画面へ抜けない） */
function trapTab(e: KeyboardEvent, dialog: HTMLElement) {
  const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0)
  if (items.length === 0) {
    e.preventDefault()
    dialog.focus()
    return
  }
  const first = items[0]
  const last = items[items.length - 1]
  const active = document.activeElement
  const outside = !dialog.contains(active) || active === dialog
  if (e.shiftKey && (active === first || outside)) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && (active === last || outside)) {
    e.preventDefault()
    first.focus()
  }
}
