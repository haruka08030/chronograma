import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import type { Task } from '../../types/task'
import { useTextEntry } from '../../hooks/useTextEntry'
import { CloseIcon } from '../icons'
import { buttonClass } from '../ui/buttonClass'
import { fieldClass } from '../ui/fieldClass'
import { sectionLabelClass } from '../ui/sectionLabelClass'

/** タスク詳細のタグ。確定せずに外を押しても足す */
export function TaskTagsField({ task }: { task: Task }) {
  const { t } = useTranslation()
  const updateTask = useTaskStore((s) => s.updateTask)
  const [tagInput, setTagInput] = useState('')

  const addTag = () => {
    const trimmed = tagInput.trim()
    if (!trimmed || task.tags.includes(trimmed)) return
    updateTask(task.id, { tags: [...task.tags, trimmed] })
    setTagInput('')
  }

  const removeTag = (tag: string) => {
    updateTask(task.id, { tags: task.tags.filter((t) => t !== tag) })
  }

  // 追加の欄の Esc は書きかけを消す（欄は出たまま）
  const tagEntry = useTextEntry({ onSubmit: () => addTag(), onCancel: () => setTagInput('') })

  return (
    <div>
      <label className={sectionLabelClass('field', 'mb-2 block')}>{t('taskDetail.tags')}</label>
      {task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {task.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md
                         bg-accent-50 dark:bg-accent-500/10 text-accent-700 dark:text-accent-300"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                aria-label={t('taskDetail.removeTag', { tag })}
                className="hover:text-red-500 transition-colors"
              >
                <CloseIcon className="w-3 h-3" strokeWidth={2.5} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          // 確定せずに閉じても書いた分を捨てない（リスト・セクションの名前と同じ）
          {...tagEntry}
          placeholder={t('taskDetail.tagPlaceholder')}
          className={fieldClass({}, 'min-w-0 flex-1')}
        />
        <button
          type="button"
          onClick={addTag}
          disabled={!tagInput.trim()}
          className={buttonClass({ variant: 'secondary', size: 'sm' }, 'shrink-0')}
        >
          {t('common.add')}
        </button>
      </div>
    </div>
  )
}
