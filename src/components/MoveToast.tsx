import { useEffect } from 'react'
import { useTaskStore } from '../store/taskStore'

const MOBILE_FLOAT_BOTTOM =
  'bottom-[calc(3.5rem+0.75rem+env(safe-area-inset-bottom))] md:bottom-6'

export function MoveToast() {
  const text = useTaskStore((s) => s.moveBannerText)
  const clearMoveBanner = useTaskStore((s) => s.clearMoveBanner)
  const activeTimer = useTaskStore((s) => s.activeTimer)

  useEffect(() => {
    if (!text) return
    const t = window.setTimeout(() => clearMoveBanner(), 2600)
    return () => window.clearTimeout(t)
  }, [text, clearMoveBanner])

  if (!text) return null

  const stacked = activeTimer
    ? 'bottom-[calc(3.5rem+4.5rem+env(safe-area-inset-bottom))] md:bottom-24'
    : MOBILE_FLOAT_BOTTOM

  return (
    <div className={`pointer-events-none fixed left-1/2 z-[60] -translate-x-1/2 animate-toast-in ${stacked}`}>
      <div
        className="max-w-[min(90vw,20rem)] rounded-xl bg-zinc-900 px-4 py-2.5 text-center text-sm text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900"
        role="status"
      >
        {text}
      </div>
    </div>
  )
}
