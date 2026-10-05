import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import type { Task } from '../../types/task'
import { useTextEntry } from '../../hooks/useTextEntry'
import { useFocusBackOnClose } from '../../hooks/useFocusBackOnClose'
import { CloseIcon } from '../icons'

/** タスク詳細の題名（押すと書き換え。Enter で確定・Esc で取り消し）と、PC の閉じるボタン */
export function TaskTitleField({ task, onClose }: { task: Task; onClose: () => void }) {
  const { t } = useTranslation()
  const updateTask = useTaskStore((s) => s.updateTask)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState(task.title)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const titleTextRef = useRef<HTMLHeadingElement>(null)
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
            {...titleEntry}
            className="w-full text-lg font-semibold text-zinc-900 dark:text-zinc-100 bg-transparent outline-none
                         border-b-2 border-accent-400 pb-0.5 break-words"
          />
        ) : (
          <h2
            ref={titleTextRef}
            onClick={() => setEditingTitle(true)}
            tabIndex={0}
            // eslint-disable-next-line jsx-a11y/no-noninteractive-element-to-interactive-role -- タイトルを押して名前を変える。button への置き換えは TaskDetail の分割のあとで
            role="button"
            aria-label={t('taskDetail.titleEditAria')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setEditingTitle(true)
              }
            }}
            className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 break-words cursor-text
                         hover:bg-zinc-50 dark:hover:bg-zinc-800/40 rounded-md px-1 -mx-1 transition-colors"
          >
            {task.title}
          </h2>
        )}
      </div>
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
  )
}
