import { useCallback, useEffect, useState } from 'react'
import { discardDialogDraft, hasDialogDraft, readDialogDraft, writeDialogDraft } from '../lib/dialogDrafts'

type Init<T> = T | (() => T)
const resolve = <T>(init: Init<T>): T => (typeof init === 'function' ? (init as () => T)() : init)

/** 開いたときの中身。書きかけがあればそれ、無ければ `initial` */
function start<T>(key: string, initial: Init<T>) {
  return hasDialogDraft(key) ? { key, value: readDialogDraft<T>(key) as T, dirty: true } : { key, value: resolve(initial), dirty: false }
}

/**
 * ダイアログの入力の中身（`useState` の代わり）。外側を押す・Esc・スワイプで閉じても書きかけを黙って残し、次に開いたら続きから（#491）。
 * 保存・キャンセルを押したら `discard` で消す（`discard(次の中身)` で手元の中身も替える。閉じずに続けて足すカード）。確認は出さない。
 * - `key` は相手ごとに分ける（例: `habit-edit:${id}`。習慣 A の書きかけを習慣 B に出さない）。替わったら中身も替える
 * - 残すのは何か変えたときだけ（開いて閉じただけなら、次はそのときの保存された値から始める）
 *
 *   const [rows, setRows, discard] = useDialogDraft('labels', () => rowsFrom(presets))
 *   const save = () => { saveLabels(rows); discard(); onClose() }
 *   <button onClick={() => { discard(); onClose() }}>キャンセル</button>
 */
export function useDialogDraft<T>(key: string, initial: Init<T>) {
  const [state, setState] = useState(() => start(key, initial))
  // 描くときに合わせる（effect で合わせると 1 回別の相手の値で描く）
  if (state.key !== key) setState(start(key, initial))

  // 変えたら置き場に入れる（閉じるときに入れると、閉じ方によっては取りこぼす）
  useEffect(() => {
    if (state.dirty) writeDialogDraft(state.key, state.value)
  }, [state])

  const set = useCallback((next: T | ((prev: T) => T)) => {
    setState((s) => ({ ...s, value: typeof next === 'function' ? (next as (prev: T) => T)(s.value) : next, dirty: true }))
  }, [])

  const discard = useCallback(
    (reset?: T) => {
      discardDialogDraft(key)
      setState((s) => (reset !== undefined ? { ...s, value: reset, dirty: false } : s.dirty ? { ...s, dirty: false } : s))
    },
    [key],
  )

  return [state.value, set, discard] as const
}
