import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDismiss } from '../../hooks/useDismiss'
import { useTaskStore } from '../../store/taskStore'
import type { Task } from '../../types/task'
import { NEUTRAL_HEX } from '../../lib/googleColors'
import { colorKeyForHex, labelForHex, recordHex } from '../../lib/logCategoryColors'
import { ColorPalette } from './ColorPalette'
import { CaretDownIcon } from '../icons'

/**
 * 記録の色＝ラベル（Google カレンダーの予定の色選択と同じ）。
 * 押すと ✎（ラベルを編集）・24 色＋自分で作った色・「分類なし」が開く。
 * 名前の付いた色を選ぶとその分類に、名前の無い色は色だけ付く（名前を付ければ後からまとめて分類になる）。
 *
 * 予定（`planDefaultHex` あり）は色だけを付ける。ToDo のタグは分類とは別物なので書き換えない。
 * 「既定」はリストの色（Google の予定の色の既定＝カレンダーの色と同じ考え方）。
 */
export function ColorLabelPicker({
  task,
  compact,
  planDefaultHex,
  label: rowLabel,
}: {
  task: Task
  compact?: boolean
  planDefaultHex?: string
  /** 行の頭に出す見出し（カードの中で、上のリスト名と続いて見えないように） */
  label?: string
}) {
  const { t } = useTranslation()
  const presets = useTaskStore((s) => s.timeLogTagPresets)
  const colors = useTaskStore((s) => s.logCategoryColors)
  const updateTask = useTaskStore((s) => s.updateTask)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // ラベル編集・色選択のダイアログ（body 直下・data-popover-keep）の中は「内側」
  useDismiss({ open, onClose: () => setOpen(false), inside: [ref] })
  useEffect(() => {
    // カードの下のほうで開いたとき、色の一覧が隠れないように見える位置まで送る
    if (open) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [open])

  const isPlan = planDefaultHex !== undefined
  const current = isPlan
    ? task.color?.toUpperCase() ?? null
    : task.tags[0] || task.color ? recordHex(task, colors).toUpperCase() : null
  // 予定は色だけ持つが、その色にラベル（分類名）が付いていれば色名ではなくラベル名で出す
  const label = isPlan ? labelForHex(current, presets, colors) : task.tags[0] ?? null
  const currentKey = colorKeyForHex(current)
  const triggerText = label ?? (currentKey ? t(`googleColors.${currentKey}`) : current ?? t(isPlan ? 'labels.listColor' : 'labels.none'))

  const choose = (hex: string | null) => {
    if (isPlan) updateTask(task.id, { color: hex })
    else if (hex === null) updateTask(task.id, { tags: [], color: null })
    else {
      const name = labelForHex(hex, presets, colors)
      updateTask(task.id, name ? { tags: [name], color: null } : { tags: [], color: hex })
    }
    setOpen(false)
  }

  return (
    <div ref={ref}>
      <div className="flex items-center gap-3">
        {rowLabel && <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">{rowLabel}</span>}
        {/* 縁つきのチップにして、押せることが一目で分かるようにする */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={t('labels.pickerAria')}
          className={`inline-flex items-center gap-2 rounded-full border border-zinc-200 text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-700/60 ${compact ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm'}`}
        >
          <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: current ?? planDefaultHex ?? NEUTRAL_HEX }} aria-hidden />
          <span>{triggerText}</span>
          <CaretDownIcon className="h-3 w-3 text-zinc-500" />
        </button>
      </div>

      {open && (
        <div className="mt-2">
          <ColorPalette
            selectedHex={current}
            onChoose={choose}
            onDefault={() => choose(null)}
            defaultLabel={t(isPlan ? 'labels.listColor' : 'labels.none')}
            defaultHex={planDefaultHex ?? NEUTRAL_HEX}
          />
        </div>
      )}
    </div>
  )
}
