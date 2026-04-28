import { useMemo, type KeyboardEventHandler } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { buildTimeLogTagUniverse } from '../lib/tagColors'

export function TimeLogTagField({
  value,
  onChange,
  listId,
  inputClassName,
  compact,
  onKeyDown,
}: {
  value: string
  onChange: (v: string) => void
  /** datalist の一意 id 用（ページ内で複数あるときにずらす） */
  listId: string
  inputClassName?: string
  /** 予定 vs ログのヘッダなど狭いとき */
  compact?: boolean
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>
}) {
  const { t } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const presets = useTaskStore((s) => s.timeLogTagPresets)
  const tagUniverse = useMemo(() => buildTimeLogTagUniverse(presets, tasks), [presets, tasks])
  const datalistId = `tag-suggestions-${listId}`

  const chipClass = compact
    ? 'text-[10px] px-1.5 py-0.5 rounded-md border border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800/80 dark:text-zinc-200 dark:hover:bg-zinc-700'
    : 'text-[11px] px-2 py-0.5 rounded-full border border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800/80 dark:text-zinc-200 dark:hover:bg-zinc-700'

  return (
    <div className="min-w-0">
      {presets.length > 0 && (
        <div className={`flex flex-wrap gap-1 ${compact ? 'mb-1' : 'mb-1.5'}`}>
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              className={chipClass}
            >
              {p}
            </button>
          ))}
        </div>
      )}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={t('activityLog.tagOptional')}
        className={inputClassName}
        list={datalistId}
      />
      <datalist id={datalistId}>
        {tagUniverse.map((tag) => (
          <option key={tag} value={tag} />
        ))}
      </datalist>
    </div>
  )
}
