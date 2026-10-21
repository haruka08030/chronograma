import { useCallback, useEffect, useRef, useState } from 'react'

/** 押した行を済んだ見た目のままその場に残す間 */
export const COMPLETE_LINGER_MS = 1500
/** 残したあと、行を縮めて消す間（`animate-row-collapse` と同じ長さ） */
export const COMPLETE_COLLAPSE_MS = 200

/**
 * To-Do・習慣を完了・達成にしたとき、押した行がその場で ✓ と取り消し線になり、1.5 秒残してから縮んで完了の欄へ移る。
 * 押した瞬間に行が消えると、押せたか・どこへ行ったかが目で追えないため（#525）。
 * - 待っている間（縮んでいる間も）にもう一度押すと取り消す（完了にしない）
 * - 続けて別の行を押したときは、それぞれの行が自分の時間で移る
 * - 完了を外すときは待たない
 * - 待っている間に画面を離れても、押した分は完了にする
 * - 動きを減らす設定でも残す（縮む動きは index.css の設定で止まり、そのまま消える）
 */
export function useDeferredComplete(commit: (id: string) => void) {
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set())
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(() => new Set())
  const timers = useRef(new Map<string, number>())
  const commitRef = useRef(commit)
  useEffect(() => {
    commitRef.current = commit
  }, [commit])

  useEffect(() => {
    const map = timers.current
    return () => {
      for (const [id, timer] of map) {
        window.clearTimeout(timer)
        commitRef.current(id)
      }
      map.clear()
    }
  }, [])

  const drop = useCallback((id: string) => {
    const without = (prev: ReadonlySet<string>) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    }
    setPending(without)
    setLeaving(without)
  }, [])

  const toggle = useCallback(
    (id: string, completed: boolean) => {
      const waiting = timers.current.get(id)
      if (waiting !== undefined) {
        window.clearTimeout(waiting)
        timers.current.delete(id)
        drop(id)
        return
      }
      if (completed) {
        commitRef.current(id)
        return
      }
      setPending((prev) => new Set(prev).add(id))
      timers.current.set(
        id,
        window.setTimeout(() => {
          setLeaving((prev) => new Set(prev).add(id))
          timers.current.set(
            id,
            window.setTimeout(() => {
              timers.current.delete(id)
              drop(id)
              commitRef.current(id)
            }, COMPLETE_COLLAPSE_MS),
          )
        }, COMPLETE_LINGER_MS),
      )
    },
    [drop],
  )

  const isPending = useCallback((id: string) => pending.has(id), [pending])
  /** 残し終えて縮んでいるところ。行に `animate-row-collapse` を付ける */
  const isLeaving = useCallback((id: string) => leaving.has(id), [leaving])

  return { isPending, isLeaving, toggle }
}
