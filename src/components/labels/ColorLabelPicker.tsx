import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDismiss } from '../../hooks/useDismiss'
import { useTaskColor } from '../../hooks/useTaskColor'
import type { Task } from '../../types/task'
import { ColorPalette } from './ColorPalette'
import { CaretDownIcon } from '../icons'

/**
 * 記録の色＝ラベル（Google カレンダーの予定の色選択と同じ）。
 * 押すと ✎（ラベルを編集）・24 色＋自分で作った色・「分類なし」が開く。
 * 名前の付いた色を選ぶとその分類に、名前の無い色は色だけ付く（名前を付ければ後からまとめて分類になる）。
 *
 * 予定（`plan`）は色だけを付ける。ToDo のタグは分類とは別物なので書き換えない。
 * 「既定」はどちらも「ラベルなし」。リストの色はラベルではないので使わない。
 */
export function ColorLabelPicker({
  task,
  compact,
  plan,
  label: rowLabel,
}: {
  task: Task
  compact?: boolean
  plan?: boolean
  /** 行の頭に出す見出し（カードの中で、上のリスト名と続いて見えないように） */
  label?: string
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const color = useTaskColor(task, plan)

  // ラベル編集・色選択のダイアログ（body 直下・data-popover-keep）の中は「内側」
  useDismiss({ open, onClose: () => setOpen(false), inside: [ref] })
  useEffect(() => {
    // カードの下のほうで開いたとき、色の一覧が隠れないように見える位置まで送る
    if (open) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [open])

  const choose = (hex: string | null) => {
    color.choose(hex)
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
          <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: color.current ?? color.defaultHex }} aria-hidden />
          <span>{color.currentText}</span>
          <CaretDownIcon className="h-3 w-3 text-zinc-500" />
        </button>
      </div>

      {open && (
        <div className="mt-2">
          <ColorPalette
            selectedHex={color.current}
            onChoose={choose}
            onDefault={() => choose(null)}
            defaultLabel={color.defaultLabel}
            defaultHex={color.defaultHex}
          />
        </div>
      )}
    </div>
  )
}
