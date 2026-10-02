import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import type { Task } from '../../types/task'
import { NEUTRAL_HEX } from '../../lib/googleColors'
import { colorKeyForHex, labelForHex, recordHex } from '../../lib/logCategoryColors'
import { ColorPalette } from './ColorPalette'

/**
 * 記録の色＝ラベル（Google カレンダーの予定の色選択と同じ）。
 * 押すと ✎（ラベルを編集）・24 色＋自分で作った色・「分類なし」が開く。
 * 名前の付いた色を選ぶとその分類に、名前の無い色は色だけ付く（名前を付ければ後からまとめて分類になる）。
 */
export function ColorLabelPicker({ task, compact }: { task: Task; compact?: boolean }) {
  const { t } = useTranslation()
  const presets = useTaskStore((s) => s.timeLogTagPresets)
  const colors = useTaskStore((s) => s.logCategoryColors)
  const updateTask = useTaskStore((s) => s.updateTask)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      // ラベル編集・色選択のダイアログ（body 直下）の中は「内側」
      if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as Element).closest?.('[data-popover-keep]')) setOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [open])

  const current = task.tags[0] || task.color ? recordHex(task, colors).toUpperCase() : null
  const label = task.tags[0] ?? null
  const currentKey = colorKeyForHex(current)
  const triggerText = label ?? (currentKey ? t(`googleColors.${currentKey}`) : current ?? t('labels.none'))

  const choose = (hex: string | null) => {
    if (hex === null) updateTask(task.id, { tags: [], color: null })
    else {
      const name = labelForHex(hex, presets, colors)
      updateTask(task.id, name ? { tags: [name], color: null } : { tags: [], color: hex })
    }
    setOpen(false)
  }

  return (
    <div ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t('labels.pickerAria')}
        className={`inline-flex items-center gap-2 rounded-lg transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-700/60 ${compact ? 'px-2 py-1 text-xs' : 'px-2.5 py-1.5 text-sm'}`}
      >
        <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: current ?? NEUTRAL_HEX }} aria-hidden />
        <span className={label ? 'text-zinc-800 dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-400'}>{triggerText}</span>
        <svg className="h-3 w-3 text-zinc-500" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M7 10l5 5 5-5z" />
        </svg>
      </button>

      {open && (
        <div className="mt-2">
          <ColorPalette
            selectedHex={current}
            onChoose={choose}
            onDefault={() => choose(null)}
            defaultLabel={t('labels.none')}
            defaultHex={NEUTRAL_HEX}
          />
        </div>
      )}
    </div>
  )
}
