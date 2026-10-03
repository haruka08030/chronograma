import { useLayoutEffect } from 'react'
import { useTaskStore } from '../store/taskStore'

/**
 * サイドバーでセクションを押したら、その見出し（`data-section-anchor`）までスクロールする。
 * 描画したあとで探すので、見出しの並びが変わる値を `deps` に渡す
 */
export function useSectionScrollTarget(deps: unknown) {
  const target = useTaskStore((s) => s.sectionScrollTarget)
  const clear = useTaskStore((s) => s.clearSectionScrollTarget)
  useLayoutEffect(() => {
    if (!target) return
    const el = document.querySelector(`[data-section-anchor="${CSS.escape(target)}"]`)
    el?.scrollIntoView({ block: 'start' })
    clear()
  }, [target, clear, deps])
}
