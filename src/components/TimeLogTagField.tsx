import { useMemo, useState, type KeyboardEventHandler } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { buildTimeLogTagUniverse } from '../lib/tagColors'
import { categoryAccent } from '../lib/logCategoryColors'

/**
 * 記録の分類（1 つ選ぶ）。候補はチップで 1 タップ、同じチップをもう一度押すと解除。
 * 「＋」から新しい分類を足すと候補（設定の分類）にも残る。
 * 選ばずに記録しても、同じタイトルの前回の分類がストア側で補われる（`inferLogCategory`）。
 */
export function TimeLogTagField({
  value,
  onChange,
  compact,
  onKeyDown,
}: {
  value: string
  onChange: (v: string) => void
  /** 旧 API 互換（datalist 用 id）。今は使わない */
  listId?: string
  /** 旧 API 互換。今は使わない */
  inputClassName?: string
  /** 予定 vs ログのヘッダなど狭いとき */
  compact?: boolean
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>
}) {
  const { t } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const presets = useTaskStore((s) => s.timeLogTagPresets)
  const addLogCategory = useTaskStore((s) => s.addLogCategory)
  const colors = useTaskStore((s) => s.logCategoryColors)
  const universe = useMemo(() => buildTimeLogTagUniverse(presets, tasks), [presets, tasks])
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  // 候補: 設定の分類 + 記録にだけある分類（多すぎると選べないので最大 10）
  const chips = useMemo(() => {
    const list = universe.slice(0, 10)
    if (value && !list.includes(value)) list.push(value)
    return list
  }, [universe, value])

  const commitDraft = () => {
    const name = draft.trim()
    if (name) {
      addLogCategory(name)
      onChange(name)
    }
    setDraft('')
    setAdding(false)
  }

  const size = compact ? 'text-[11px] px-2 py-0.5' : 'text-xs px-2.5 py-1'

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5" role="radiogroup" aria-label={t('logCategories.label')}>
      {chips.map((name) => {
        const selected = value === name
        const color = categoryAccent(name, colors)
        return (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(selected ? '' : name)}
            className={`rounded-full border transition-colors touch-manipulation ${size} ${
              selected
                ? `${color.bg} ${color.text} ${color.border} font-medium`
                : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              {!selected && <span className={`h-1.5 w-1.5 rounded-full ${color.dot}`} aria-hidden />}
              {name}
            </span>
          </button>
        )
      })}
      {adding ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === 'NumpadEnter') && !e.nativeEvent.isComposing) {
              e.preventDefault()
              commitDraft()
              return
            }
            if (e.key === 'Escape') {
              setDraft('')
              setAdding(false)
              return
            }
            onKeyDown?.(e)
          }}
          placeholder={t('logCategories.newPlaceholder')}
          className={`w-28 rounded-full border border-accent-300 bg-white outline-none dark:border-accent-500/50 dark:bg-zinc-900 ${size}`}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          aria-label={t('logCategories.add')}
          title={t('logCategories.add')}
          className={`rounded-full border border-dashed border-zinc-300 text-zinc-400 transition-colors hover:border-accent-400 hover:text-accent-600 dark:border-zinc-600 ${size}`}
        >
          ＋
        </button>
      )}
    </div>
  )
}
