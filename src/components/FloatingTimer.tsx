import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function FloatingTimer() {
  const { t } = useTranslation()
  const activeTimer = useTaskStore((s) => s.activeTimer)
  const stopTimer = useTaskStore((s) => s.stopTimer)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!activeTimer) {
      queueMicrotask(() => setElapsed(0))
      return
    }
    const start = new Date(activeTimer.startedAt).getTime()
    const tick = () => setElapsed(Date.now() - start)
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [activeTimer])

  if (!activeTimer) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50
                    bg-white dark:bg-zinc-800 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-700
                    px-5 py-3 flex items-center gap-4 min-w-[280px]">
      <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
          {activeTimer.taskTitle}
        </p>
        {activeTimer.tags?.length > 0 && (
          <div className="flex gap-1 mt-0.5">
            {activeTimer.tags.map((tag) => (
              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent-100 dark:bg-accent-500/20 text-accent-700 dark:text-accent-300">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
      <span className="text-lg font-mono font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
        {formatElapsed(elapsed)}
      </span>
      <button
        onClick={stopTimer}
        className="p-2 rounded-xl bg-red-500 hover:bg-red-600 text-white transition-colors"
        title={t('floatingTimer.stopTitle')}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <rect x="6" y="6" width="12" height="12" rx="1" />
        </svg>
      </button>
    </div>
  )
}
