import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'

const MOBILE_FLOAT_BOTTOM =
  'bottom-[calc(3.5rem+0.75rem+env(safe-area-inset-bottom))] md:bottom-6'

export function UndoToast() {
  const { t } = useTranslation()
  const deletedTasks = useTaskStore((s) => s.deletedTasks)
  const undoLastOperation = useTaskStore((s) => s.undoLastOperation)
  const undoDelete = useTaskStore((s) => s.undoDelete)
  const clearDeletedTasks = useTaskStore((s) => s.clearDeletedTasks)
  const activeTimer = useTaskStore((s) => s.activeTimer)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (deletedTasks.length > 0) {
      queueMicrotask(() => setVisible(true))
      const timer = setTimeout(() => {
        setVisible(false)
        clearDeletedTasks()
      }, 5000)
      return () => clearTimeout(timer)
    }
    queueMicrotask(() => setVisible(false))
  }, [deletedTasks.length, clearDeletedTasks])

  if (!visible || deletedTasks.length === 0) return null

  // タイマー表示中は一段上へずらして重なりを避ける
  const stacked = activeTimer
    ? 'bottom-[calc(3.5rem+4.5rem+env(safe-area-inset-bottom))] md:bottom-24'
    : MOBILE_FLOAT_BOTTOM

  return (
    <div className={`fixed left-1/2 z-50 -translate-x-1/2 animate-toast-in ${stacked}`}>
      <div className="mx-3 flex max-w-[min(100vw-1.5rem,24rem)] items-center gap-3 rounded-xl bg-zinc-900 px-4 py-3 text-sm text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900">
        <span>{t('undo.message')}</span>
        <button
          onClick={() => {
            if (!undoLastOperation()) undoDelete()
            setVisible(false)
          }}
          className="font-medium text-accent-300 touch-manipulation dark:text-accent-600 hover:underline"
        >
          {t('undo.button')}
        </button>
        <span className="ml-1 hidden text-xs text-zinc-400 dark:text-zinc-500 sm:inline">
          {navigator.platform.toLowerCase().includes('mac') ? t('undo.shortcutMac') : t('undo.shortcutWin')}
        </span>
      </div>
    </div>
  )
}
