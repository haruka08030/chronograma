import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'

const MOBILE_FLOAT_BOTTOM =
  'bottom-[calc(3.5rem+0.75rem+env(safe-area-inset-bottom))] md:bottom-6'

const VISIBLE_MS = 5000

/**
 * 取り消せる操作のトースト。
 *
 * 削除は `deletedTasks`（ゴミ箱に入ったもの）から、それ以外の取り消せる操作は
 * `undoBanner`（`pushUndo` にラベルを渡した操作）から出す。以前は削除専用で、
 * 一括アーカイブやセクション削除が戻せることが画面から分からなかった。
 */
export function UndoToast() {
  const { t } = useTranslation()
  const deletedTasks = useTaskStore((s) => s.deletedTasks)
  const undoBanner = useTaskStore((s) => s.undoBanner)
  const undoLastOperation = useTaskStore((s) => s.undoLastOperation)
  const undoDelete = useTaskStore((s) => s.undoDelete)
  const clearDeletedTasks = useTaskStore((s) => s.clearDeletedTasks)
  const clearUndoBanner = useTaskStore((s) => s.clearUndoBanner)
  const activeTimer = useTaskStore((s) => s.activeTimer)
  const [visible, setVisible] = useState(false)

  const deletedCount = deletedTasks.length
  /** 削除のトーストを優先する（ゴミ箱からの復元という別の戻し方があるため） */
  const kind = deletedCount > 0 ? 'deleted' : undoBanner ? 'operation' : null
  const bannerAt = undoBanner?.at ?? 0

  useEffect(() => {
    if (!kind) {
      queueMicrotask(() => setVisible(false))
      return
    }
    queueMicrotask(() => setVisible(true))
    const timer = setTimeout(() => {
      setVisible(false)
      if (kind === 'deleted') clearDeletedTasks()
      else clearUndoBanner()
    }, VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [kind, deletedCount, bannerAt, clearDeletedTasks, clearUndoBanner])

  if (!visible || !kind) return null

  const message = kind === 'deleted' ? t('undo.message') : (undoBanner?.text ?? '')

  // タイマー表示中は一段上へずらして重なりを避ける
  const stacked = activeTimer
    ? 'bottom-[calc(3.5rem+4.5rem+env(safe-area-inset-bottom))] md:bottom-24'
    : MOBILE_FLOAT_BOTTOM

  return (
    <div className={`fixed left-1/2 z-50 -translate-x-1/2 animate-toast-in ${stacked}`}>
      <div className="mx-3 flex max-w-[min(100vw-1.5rem,24rem)] items-center gap-3 rounded-xl bg-zinc-900 px-4 py-3 text-sm text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900">
        <span className="min-w-0 truncate">{message}</span>
        <button
          onClick={() => {
            if (kind === 'deleted') {
              if (!undoLastOperation()) undoDelete()
            } else {
              undoLastOperation()
              clearUndoBanner()
            }
            setVisible(false)
          }}
          className="shrink-0 font-semibold text-white underline-offset-2 touch-manipulation dark:text-zinc-900 hover:underline"
        >
          {t('undo.button')}
        </button>
        <span className="ml-1 hidden shrink-0 text-xs text-zinc-400 dark:text-zinc-500 sm:inline">
          {navigator.platform.toLowerCase().includes('mac') ? t('undo.shortcutMac') : t('undo.shortcutWin')}
        </span>
      </div>
    </div>
  )
}
