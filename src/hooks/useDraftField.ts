import { useCallback, useEffect, useRef, useState } from 'react'
import { registerPendingEdit } from '../lib/pendingEdits'

/** 打つのが止まってからストアに入れるまで */
export const DRAFT_SAVE_DELAY_MS = 600

/**
 * 打つたびに保存していた欄（メモ・場所）を、手元の書きかけで持つ。
 * 1 文字ごとにストアを変えると、全データの保存・他のタブの読み直し・表示中の全画面の再計算が毎回走る（#266）。
 * - 打つのが止まったら（`DRAFT_SAVE_DELAY_MS`）ストアに入れる。`flush` で待たずに入れる（フォーカスが外れたとき）
 * - 欄が消える・別のタスクに替わる（`itemKey`）・タブを閉じる・裏に回るときも入れる（`pendingEdits.ts`）
 * - 書きかけが無い間に保存されている値が外から変わったら（元に戻す・他のタブ・同期）合わせる
 *
 *   const memo = useDraftField(task.description, (v) => updateTask(task.id, { description: v }), task.id)
 *   <textarea value={memo.value} onChange={(e) => memo.change(e.target.value)} onBlur={memo.flush} />
 */
export function useDraftField(stored: string, save: (value: string) => void, itemKey: string) {
  const [draft, setDraft] = useState({ value: stored, stored, itemKey, dirty: false })
  // 描くときに合わせる（effect で合わせると 1 回古い値で描く）
  if (draft.itemKey !== itemKey || (draft.stored !== stored && !draft.dirty)) {
    setDraft({ value: stored, stored, itemKey, dirty: false })
  }

  /** まだストアに入れていない書きかけ（打ったときの `save` で入れる＝そのときのタスクに入る） */
  const pending = useRef<(() => void) | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const flush = useCallback(() => {
    clearTimeout(timer.current)
    const run = pending.current
    if (!run) return
    pending.current = null
    run()
    setDraft((d) => (d.dirty ? { ...d, dirty: false } : d))
  }, [])

  // 欄が消える・別のタスクに替わる前に、書きかけを入れる
  useEffect(() => {
    const unregister = registerPendingEdit(flush)
    return () => {
      flush()
      unregister()
    }
  }, [flush, itemKey])

  const change = (value: string) => {
    setDraft((d) => ({ ...d, value, dirty: true }))
    pending.current = () => save(value)
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, DRAFT_SAVE_DELAY_MS)
  }

  return { value: draft.value, change, flush }
}
