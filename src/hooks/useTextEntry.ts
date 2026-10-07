import { useRef, type KeyboardEvent } from 'react'
import { isCancelEscape, isSubmitEnter, textAreaKeyAction } from '../lib/keyboard'

/**
 * 1 行の入力欄の Enter / Esc / フォーカス外しを、どの欄でも同じ意味にする。
 * - Enter（変換の確定は除く）: `onSubmit`
 * - Esc（変換中は除く）: `onCancel`。親（ダイアログ）は閉じない。閉じるのは次の Esc
 * - フォーカスが外れた: `commitOnBlur` なら `onSubmit`（書いた分を捨てない）
 * - Enter / Esc で欄が閉じたときに続けて来る blur は無視する（Esc で取り消したのに保存される、Enter で 2 回送る、を防ぐ）
 *
 *   const entry = useTextEntry({ onSubmit: commit, onCancel: () => setEditing(false) })
 *   <input value={v} onChange={...} {...entry} />
 */
export function useTextEntry({
  onSubmit,
  onCancel,
  commitOnBlur = true,
  onBlurSubmit,
  onOtherKey,
}: {
  onSubmit: () => void
  onCancel: () => void
  commitOnBlur?: boolean
  /** フォーカスが外れたときだけ別のことをする（Enter は続けて書く、外したら閉じる、など） */
  onBlurSubmit?: () => void
  /** Enter / Esc 以外のキー（候補の上下など） */
  onOtherKey?: (e: KeyboardEvent<HTMLInputElement>) => void
}) {
  /** Enter / Esc を押した直後。同じ流れで来る blur を無視する（欄が開いたままなら次の瞬間には戻す） */
  const justHandled = useRef(false)
  const mark = () => {
    justHandled.current = true
    window.setTimeout(() => {
      justHandled.current = false
    }, 0)
  }
  return {
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
      if (isSubmitEnter(e)) {
        e.preventDefault()
        mark()
        onSubmit()
        return
      }
      if (isCancelEscape(e)) {
        e.preventDefault()
        e.stopPropagation()
        mark()
        onCancel()
        return
      }
      onOtherKey?.(e)
    },
    onBlur: () => {
      if (justHandled.current) return
      if (onBlurSubmit) onBlurSubmit()
      else if (commitOnBlur) onSubmit()
    },
  }
}

/**
 * 複数行の欄（メモ）のキーを、どの欄でも同じ意味にする。保存の道はフォーカスが外れたとき（`onCommit`）の 1 本だけ。
 * - Enter: 改行
 * - ⌘/Ctrl+Enter（変換の確定は除く）: 確定して欄を離れる
 * - Esc（変換中は除く）: 欄を離れる。書いた分は捨てない。親（ダイアログ）は閉じない。閉じるのは次の Esc
 * - フォーカスが外れた: `onCommit`（打つたびに保存している欄は、編集の表示を閉じるだけでよい）
 *
 *   const memoEntry = useTextAreaEntry({ onCommit: () => setEditing(false) })
 *   <textarea value={v} onChange={...} {...memoEntry} />
 */
export function useTextAreaEntry({ onCommit }: { onCommit?: () => void } = {}) {
  return {
    onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (!textAreaKeyAction(e)) return
      // ⌘Enter（選択中を完了）や Esc（ダイアログを閉じる）を外側のショートカットに渡さない
      e.preventDefault()
      e.stopPropagation()
      e.currentTarget.blur()
    },
    onBlur: () => onCommit?.(),
  }
}
