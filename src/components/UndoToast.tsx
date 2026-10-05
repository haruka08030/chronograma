import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { useShallow } from 'zustand/react/shallow'
import type { Task } from '../types/task'
import { undoGoogleDelete } from '../lib/googleEventEdit'
import { UNDO_WINDOW_MS, toastTitle } from '../lib/undoWindow'
import { shortcutLabel } from '../lib/keyboard'
import { toastText } from '../lib/toastText'
import { INVERSE_SURFACE } from './ui/surface'
import { usePresence } from '../hooks/usePresence'

const MOBILE_FLOAT_BOTTOM =
  'bottom-[calc(3.5rem+0.75rem+env(safe-area-inset-bottom))] md:bottom-6'


/**
 * 取り消せる操作のトースト。
 *
 * 削除は `recentDeletes`（直近にゴミ箱へ入れた id。中身は tasks から読む）から、それ以外の取り消せる操作は
 * `undoBanner`（`pushUndo` にラベルを渡した操作）から出す。以前は削除専用で、
 * 一括アーカイブやセクション削除が戻せることが画面から分からなかった。
 */
const NO_TASKS: Task[] = []

export function UndoToast() {
  const { t } = useTranslation()
  const recentDeletes = useTaskStore((s) => s.recentDeletes)
  // 消したタスクだけを購読する（ほかのタスクの変化でトーストを描き直さない）
  const deletedTasks = useTaskStore(
    useShallow((s) => {
      if (s.recentDeletes.length === 0) return NO_TASKS
      const ids = new Set(s.recentDeletes.flatMap((b) => b.ids))
      return s.tasks.filter((x) => ids.has(x.id))
    }),
  )
  const undoBanner = useTaskStore((s) => s.undoBanner)
  const googleUndo = useTaskStore((s) => s.googleUndo)
  const setGoogleUndo = useTaskStore((s) => s.setGoogleUndo)
  const undoLastOperation = useTaskStore((s) => s.undoLastOperation)
  const undoDelete = useTaskStore((s) => s.undoDelete)
  const clearDeletedTasks = useTaskStore((s) => s.clearDeletedTasks)
  const clearUndoBanner = useTaskStore((s) => s.clearUndoBanner)
  const activeTimer = useTaskStore((s) => s.activeTimer)
  const [visible, setVisible] = useState(false)

  const deletedIds = recentDeletes.flatMap((b) => b.ids)
  const deletedCount = deletedIds.length
  /** 削除のトーストを優先する（ゴミ箱からの復元という別の戻し方があるため） */
  // 消したばかりの Google の予定を最優先（トーストが消えると Google に送られ、戻せなくなる）
  const kind = googleUndo ? 'google' : deletedCount > 0 ? 'deleted' : undoBanner ? 'operation' : null
  const bannerAt = googleUndo?.at ?? undoBanner?.at ?? 0

  useEffect(() => {
    if (!kind) {
      queueMicrotask(() => setVisible(false))
      return
    }
    queueMicrotask(() => setVisible(true))
    const timer = setTimeout(() => {
      setVisible(false)
      if (kind === 'google') setGoogleUndo(null)
      else if (kind === 'deleted') clearDeletedTasks()
      else clearUndoBanner()
    }, UNDO_WINDOW_MS)
    return () => clearTimeout(timer)
  }, [kind, deletedCount, bannerAt, clearDeletedTasks, clearUndoBanner, setGoogleUndo])

  const open = visible && kind !== null
  const message = !open
    ? null
    : kind === 'google' ? (googleUndo?.text ?? '') : kind === 'deleted' ? deletedMessage() : (undoBanner ? toastText(t, undoBanner.text) : '')
  // 消えるときも、下へ沈む動きのあいだは前の文を出しておく（押せないようにする）
  const toast = usePresence(message)
  if (toast.shown === null) return null

  /** 何を消したか: 1 件ならタイトル、まとめてなら件数（一緒に消えたサブタスクは数えない） */
  function deletedMessage() {
    const ids = new Set(deletedIds)
    const roots = deletedTasks.filter((x) => !x.parentId || !ids.has(x.parentId))
    if (roots.length === 1 && roots[0].title.trim()) return t('undo.taskDeleted', { title: toastTitle(roots[0].title) })
    if (roots.length > 1) return t('undo.tasksDeleted', { count: roots.length })
    return t('undo.message')
  }


  // タイマー表示中は一段上へずらして重なりを避ける
  const stacked = activeTimer
    ? 'bottom-[calc(3.5rem+4.5rem+env(safe-area-inset-bottom))] md:bottom-24'
    : MOBILE_FLOAT_BOTTOM

  return (
    <div className={`fixed left-1/2 z-50 -translate-x-1/2 ${toast.closing ? 'animate-toast-out' : 'animate-toast-in'} ${stacked}`} inert={toast.closing}>
      <div className={`mx-3 flex max-w-[min(100vw-1.5rem,32rem)] items-center gap-3 rounded-xl px-4 py-3 text-sm ${INVERSE_SURFACE}`}>
        <span className="min-w-0 line-clamp-2">{toast.shown}</span>
        <button
          onClick={() => {
            if (kind === 'google') {
              undoGoogleDelete()
            } else if (kind === 'deleted') {
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
          {shortcutLabel(['mod', 'Z'])}
        </span>
      </div>
    </div>
  )
}
