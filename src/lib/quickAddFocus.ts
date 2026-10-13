import { useEffect, useRef, type RefObject } from 'react'

/**
 * 画面の「タスクを追加」欄（To-Do 一覧の上・今日の計画）へのフォーカス。
 * 欄は出ている間だけ自分を登録し、ショートカット（C / ⌘N）はここに頼む（DOM を探さない）。
 * 欄の無いカレンダーは、代わりに作成カードを開く処理を登録する（`useQuickAddAction`）。
 * 画面は必要になってから読み込むので、頼んだ時点で欄が無ければ覚えておき、出たときにフォーカスする
 */
const targets: (() => void)[] = []
let waitTimer: number | null = null

const stopWaiting = () => {
  if (waitTimer === null) return
  window.clearTimeout(waitTimer)
  waitTimer = null
}

/** 追加欄が画面に出ているか */
export function hasQuickAddTarget(): boolean {
  return targets.length > 0
}

/** 出ている追加欄にフォーカスする。無ければ false */
export function focusQuickAdd(): boolean {
  const focus = targets[targets.length - 1]
  if (!focus) return false
  stopWaiting()
  focus()
  return true
}

/** 追加欄にフォーカスする。まだ無ければ、`timeoutMs` の間に出たときにフォーカスする */
export function focusQuickAddWhenReady(timeoutMs = 3000) {
  if (focusQuickAdd()) return
  stopWaiting()
  waitTimer = window.setTimeout(() => {
    waitTimer = null
  }, timeoutMs)
}

/** 追加欄の代わりに C / ⌘N で行う処理を登録する（null の間は登録しない。カレンダーの作成カードなど） */
export function useQuickAddAction(action: (() => void) | null) {
  const ref = useRef(action)
  useEffect(() => {
    ref.current = action
  })
  const enabled = action !== null
  useEffect(() => {
    if (!enabled) return
    const run = () => ref.current?.()
    targets.push(run)
    return () => {
      const i = targets.lastIndexOf(run)
      if (i >= 0) targets.splice(i, 1)
    }
  }, [enabled])
}

/** 追加欄の入力を登録する（出ている間だけ）。待っている頼みがあれば、出たときにフォーカスする */
export function useQuickAddTarget(ref: RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    const focus = () => ref.current?.focus()
    targets.push(focus)
    if (waitTimer !== null) {
      stopWaiting()
      focus()
    }
    return () => {
      const i = targets.lastIndexOf(focus)
      if (i >= 0) targets.splice(i, 1)
    }
  }, [ref])
}
