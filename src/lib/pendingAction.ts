import { useEffect, useRef } from 'react'

/**
 * 画面を切り替えてから、その画面の部品にしてほしいこと（「記録する」を開く など）。
 * 画面は必要になってから読み込むので、頼んだ時点では受け取る部品がまだ無いことがある。
 * 時間を決めて待たず、頼んだことを覚えておき、部品が出たときに受け取る
 */
const pending = new Set<string>()
const eventName = (name: string) => `chronograma:action:${name}`

export function requestAction(name: string) {
  pending.add(name)
  window.dispatchEvent(new Event(eventName(name)))
}

/** 頼まれたことを受け取る。出たときにすでに頼まれていれば、そのとき受け取る */
export function usePendingAction(name: string, handler: () => void) {
  const ref = useRef(handler)
  useEffect(() => {
    ref.current = handler
  })
  useEffect(() => {
    const take = () => {
      if (!pending.delete(name)) return
      ref.current()
    }
    take()
    window.addEventListener(eventName(name), take)
    return () => window.removeEventListener(eventName(name), take)
  }, [name])
}

/**
 * 要素が画面に出たら `run` する（すでにあればすぐ）。出ないまま `timeoutMs` 経ったらやめる。
 * 画面の切り替え直後に、その画面の入力欄へフォーカスするとき用
 */
export function whenElement<T extends Element>(find: () => T | null, run: (el: T) => void, timeoutMs = 3000) {
  const now = find()
  if (now) {
    run(now)
    return
  }
  const observer = new MutationObserver(() => {
    const el = find()
    if (!el) return
    observer.disconnect()
    window.clearTimeout(timer)
    run(el)
  })
  observer.observe(document.body, { childList: true, subtree: true })
  const timer = window.setTimeout(() => observer.disconnect(), timeoutMs)
}
