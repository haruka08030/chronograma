import { useCallback, useEffect, useRef, useState } from 'react'

/** 完了の印と取り消し線を見せてから、実際に完了にする（完了の欄へ移す）までの間 */
export const COMPLETE_DELAY_MS = 350

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/**
 * To-Do を完了にしたとき、押した行がその場で ✓ と取り消し線になり、少し置いてから完了の欄へ移る。
 * 押した瞬間に行が消えると、押せたかが目で追えないため。
 * - 待っている間にもう一度押すと取り消す（完了にしない）
 * - 完了を外すとき・動きを減らす設定のときは待たない
 * - 待っている間に画面を離れても、押した分は完了にする
 */
export function useDeferredComplete(commit: (taskId: string) => void) {
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set())
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
    setPending((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  const toggle = useCallback((taskId: string, completed: boolean) => {
    const waiting = timers.current.get(taskId)
    if (waiting !== undefined) {
      window.clearTimeout(waiting)
      timers.current.delete(taskId)
      drop(taskId)
      return
    }
    if (completed || prefersReducedMotion()) {
      commitRef.current(taskId)
      return
    }
    setPending((prev) => new Set(prev).add(taskId))
    timers.current.set(taskId, window.setTimeout(() => {
      timers.current.delete(taskId)
      drop(taskId)
      commitRef.current(taskId)
    }, COMPLETE_DELAY_MS))
  }, [drop])

  const isPending = useCallback((taskId: string) => pending.has(taskId), [pending])

  return { isPending, toggle }
}
