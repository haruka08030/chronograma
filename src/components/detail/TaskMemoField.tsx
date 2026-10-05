import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import type { Task } from '../../types/task'
import { useTextAreaEntry } from '../../hooks/useTextEntry'
import { LinkifiedText } from '../ui/LinkifiedText'
import { fieldClass } from '../ui/fieldClass'

/** タスク詳細のメモ。押すと書ける欄になり、打つたびに保存する。リンクは押せる */
export function TaskMemoField({ task, isLog }: { task: Task; isLog: boolean }) {
  const { t } = useTranslation()
  const updateTask = useTaskStore((s) => s.updateTask)
  const [editingMemo, setEditingMemo] = useState(false)
  const memoTextareaRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (editingMemo) {
      const el = memoTextareaRef.current
      el?.focus()
      if (el) el.selectionStart = el.selectionEnd = el.value.length
    }
  }, [editingMemo])
  // メモは打つたびに保存している。離れたら表示に戻すだけ
  const memoEntry = useTextAreaEntry({ onCommit: () => setEditingMemo(false) })

  return (
    <div>
      {editingMemo ? (
        <textarea
          ref={memoTextareaRef}
          value={task.description}
          onChange={(e) => updateTask(task.id, { description: e.target.value })}
          {...memoEntry}
          placeholder={isLog ? t('taskDetail.memoPlaceholderLog') : t('taskDetail.memoPlaceholderTask')}
          rows={isLog ? 4 : 2}
          className={fieldClass({}, 'w-full resize-none min-h-[4rem]')}
        />
      ) : task.description.trim() ? (
        <>
          {/* キーで編集に入るボタン（見えない。フォーカス中は下のメモに枠を出す）。メモの中のリンクを押せるよう、メモ自体はボタンにしない */}
          <button type="button" onClick={() => setEditingMemo(true)} className="peer sr-only">
            {t('taskDetail.editMemo')}
          </button>
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- 押して編集はマウスの近道。キーは上の見えないボタン */}
          <div
            onClick={() => {
              // 文字を選んでコピーしたいときは編集に切り替えない
              if (window.getSelection()?.toString()) return
              setEditingMemo(true)
            }}
            className="select-text w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700
                       bg-transparent text-zinc-900 dark:text-zinc-100 min-h-[4rem]
                       whitespace-pre-wrap break-words cursor-text
                       hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors
                       peer-focus-visible:ring-2 peer-focus-visible:ring-accent-500/40"
          >
            <LinkifiedText text={task.description} />
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setEditingMemo(true)}
          className="block w-full text-left px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700
                       bg-transparent text-zinc-400 min-h-[4rem] cursor-text
                       hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors"
        >
          {isLog ? t('taskDetail.memoPlaceholderLog') : t('taskDetail.memoPlaceholderTask')}
        </button>
      )}
    </div>
  )
}
