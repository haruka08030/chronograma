import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'

export function UndoToast() {
  const { t } = useTranslation()
  const deletedTasks = useTaskStore((s) => s.deletedTasks)
  const undoLastOperation = useTaskStore((s) => s.undoLastOperation)
  const undoDelete = useTaskStore((s) => s.undoDelete)
  const clearDeletedTasks = useTaskStore((s) => s.clearDeletedTasks)
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

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-toast-in">
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-900 dark:bg-zinc-100
                       text-white dark:text-zinc-900 shadow-lg text-sm">
        <span>{t('undo.message')}</span>
        <button
          onClick={() => {
            if (!undoLastOperation()) undoDelete()
            setVisible(false)
          }}
          className="font-medium text-accent-300 dark:text-accent-600 hover:underline"
        >
          {t('undo.button')}
        </button>
        <span className="text-zinc-400 dark:text-zinc-500 text-xs ml-1">
          {navigator.platform.toLowerCase().includes('mac') ? t('undo.shortcutMac') : t('undo.shortcutWin')}
        </span>
      </div>
    </div>
  )
}
