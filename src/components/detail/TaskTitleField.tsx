import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import type { Task } from '../../types/task'
import { useTextEntry } from '../../hooks/useTextEntry'
import { useFocusBackOnClose } from '../../hooks/useFocusBackOnClose'
import { CloseIcon, EllipsisIcon, TrashIcon } from '../icons'
import { tip } from '../../lib/tooltip'
import { TITLE_MAX_LENGTH } from '../../lib/textLimits'

/** タスク詳細の題名（押すと書き換え。Enter で確定・Esc で取り消し）と、PC の閉じるボタン */
export function TaskTitleField({
  task,
  onClose,
  onDelete,
  deleteLabel,
  onMore,
}: {
  task: Task
  onClose: () => void
  /** × の左の 🗑（Google カレンダーの詳細と同じ位置。スマホは上に固定した帯の右） */
  onDelete?: () => void
  deleteLabel?: string
  /** 🗑 の左の …（行の右クリックと同じタスクのメニュー。複製・明日へ回す・記録を始める・移動など。スマホは上の帯の右） */
  onMore?: (anchor: HTMLElement) => void
}) {
  const { t } = useTranslation()
  const updateTask = useTaskStore((s) => s.updateTask)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState(task.title)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const titleTextRef = useRef<HTMLButtonElement>(null)
  const hintId = useId()
  // 題名の編集を Enter・Esc で閉じたら、フォーカスを題名に戻す
  useFocusBackOnClose(editingTitle, titleTextRef)

  useEffect(() => {
    queueMicrotask(() => setTitleValue(task.title))
  }, [task.title])
  useEffect(() => {
    if (editingTitle) {
      titleInputRef.current?.focus()
      titleInputRef.current?.select()
    }
  }, [editingTitle])

  const commitTitle = () => {
    const trimmed = titleValue.trim()
    if (trimmed && trimmed !== task.title) {
      updateTask(task.id, { title: trimmed })
    }
    setEditingTitle(false)
    setTitleValue(trimmed || task.title)
  }

  const titleEntry = useTextEntry({
    onSubmit: commitTitle,
    onCancel: () => {
      setTitleValue(task.title)
      setEditingTitle(false)
    },
  })

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        {editingTitle ? (
          <input
            ref={titleInputRef}
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            maxLength={TITLE_MAX_LENGTH}
            {...titleEntry}
            aria-label={t('taskDetail.titleEditAria')}
            className="w-full text-lg font-semibold text-zinc-900 dark:text-zinc-100 bg-transparent outline-none
                         border-b-2 border-accent-400 pb-0.5 break-words"
          />
        ) : (
          // 見出しの中に本物のボタン（押す・Enter・Space で名前を変える）。読み上げの名前は題名、説明に「タイトルを編集」
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 break-words">
            <button
              ref={titleTextRef}
              type="button"
              onClick={() => setEditingTitle(true)}
              aria-describedby={hintId}
              className="-mx-1 block w-[calc(100%+0.5rem)] cursor-text rounded-md px-1 text-left break-words transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
            >
              {task.title}
            </button>
            <span id={hintId} hidden>
              {t('taskDetail.titleEditAria')}
            </span>
          </h2>
        )}
      </div>
      <div className="flex flex-shrink-0 items-center gap-1">
        {onMore && (
          <button
            type="button"
            onClick={(e) => onMore(e.currentTarget)}
            aria-haspopup="menu"
            {...tip(t('taskItem.moreMenuAria'), { name: true })}
            className="hidden p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex-shrink-0 md:block"
          >
            <EllipsisIcon className="w-5 h-5 text-zinc-400" />
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            aria-label={deleteLabel}
            {...tip(deleteLabel)}
            className="hidden p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex-shrink-0 md:block"
          >
            <TrashIcon className="w-5 h-5 text-zinc-400" strokeWidth={1.75} />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          // スマホは上に固定した「戻る」で閉じる（ここはスクロールで消え、右上は親指が届きにくい）
          className="hidden p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex-shrink-0 md:block"
        >
          <CloseIcon className="w-5 h-5 text-zinc-400" />
        </button>
      </div>
    </div>
  )
}
