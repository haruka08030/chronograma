import { useMemo, useState, type KeyboardEventHandler } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { buildTimeLogTagUniverse } from '../lib/tagColors'
import { categoryHex, colorVars } from '../lib/logCategoryColors'
import { useTextEntry } from '../hooks/useTextEntry'
import { tip } from '../lib/tooltip'
import { chipClass } from './ui/chipClass'

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

  // 候補: 設定の分類（すべて）+ 記録にだけある分類（多すぎると選べないので合わせて 12 まで）
  const chips = useMemo(() => {
    const list = universe.slice(0, Math.max(12, presets.length))
    if (value && !list.includes(value)) list.push(value)
    return list
  }, [universe, presets.length, value])

  const commitDraft = () => {
    const name = draft.trim()
    if (name) {
      addLogCategory(name)
      onChange(name)
    }
    setDraft('')
    setAdding(false)
  }
  const draftEntry = useTextEntry({
    onSubmit: commitDraft,
    onCancel: () => {
      setDraft('')
      setAdding(false)
    },
    onOtherKey: onKeyDown,
  })

  const size = compact ? 'sm' : 'md'

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5" role="radiogroup" aria-label={t('logCategories.label')}>
      {chips.map((name) => {
        const selected = value === name
        const vars = colorVars(categoryHex(name, colors))
        return (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(selected ? '' : name)}
            className={chipClass({ variant: 'outline', size, selected })}
            style={selected ? vars : undefined}
          >
            <span className="inline-flex items-center gap-1.5">
              {!selected && <span className="gc-dot h-1.5 w-1.5 rounded-full" style={vars} aria-hidden />}
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
          {...draftEntry}
          placeholder={t('logCategories.newPlaceholder')}
          className={`w-28 rounded-full border border-accent-300 bg-white outline-none dark:border-accent-500/50 dark:bg-zinc-900 ${compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'}`}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          aria-label={t('logCategories.add')}
          {...tip(t('logCategories.add'))}
          className={chipClass({ variant: 'add', size })}
        >
          ＋
        </button>
      )}
    </div>
  )
}
