import { useEffect } from 'react'
import { useTaskStore } from '../store/taskStore'

export function MoveToast() {
  const text = useTaskStore((s) => s.moveBannerText)
  const clearMoveBanner = useTaskStore((s) => s.clearMoveBanner)

  useEffect(() => {
    if (!text) return
    const t = window.setTimeout(() => clearMoveBanner(), 2600)
    return () => window.clearTimeout(t)
  }, [text, clearMoveBanner])

  if (!text) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] animate-toast-in pointer-events-none">
      <div
        className="px-4 py-2.5 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900
                   shadow-lg text-sm max-w-[min(90vw,20rem)] text-center"
        role="status"
      >
        {text}
      </div>
    </div>
  )
}
