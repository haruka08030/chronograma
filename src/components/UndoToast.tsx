import { useEffect, useState } from 'react'
import { useTaskStore } from '../store/taskStore'

export function UndoToast() {
  const deletedTasks = useTaskStore((s) => s.deletedTasks)
  const undoDelete = useTaskStore((s) => s.undoDelete)
  const clearDeletedTasks = useTaskStore((s) => s.clearDeletedTasks)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (deletedTasks.length > 0) {
      setVisible(true)
      const timer = setTimeout(() => {
        setVisible(false)
        clearDeletedTasks()
      }, 5000)
      return () => clearTimeout(timer)
    } else {
      setVisible(false)
    }
  }, [deletedTasks.length, clearDeletedTasks])

  if (!visible || deletedTasks.length === 0) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-toast-in">
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-900 dark:bg-zinc-100
                       text-white dark:text-zinc-900 shadow-lg text-sm">
        <span>タスクを削除しました</span>
        <button
          onClick={() => { undoDelete(); setVisible(false) }}
          className="font-medium text-accent-300 dark:text-accent-600 hover:underline"
        >
          元に戻す
        </button>
        <span className="text-zinc-400 dark:text-zinc-500 text-xs ml-1">⌘Z</span>
      </div>
    </div>
  )
}
