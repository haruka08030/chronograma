import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDismiss } from '../../hooks/useDismiss'
import { ColorPalette } from './ColorPalette'
import { CaretDownIcon } from '../icons'
import { colorVars } from '../../lib/logCategoryColors'

/**
 * 色＝ラベルのチップと、押すと開く色の一覧（`ColorLabelPicker` の見た目の部分）。
 * タスクに付いていない色（よく入れる予定の登録など）もこれで選ぶ
 */
export function ColorLabelSelect({
  current,
  currentText,
  onChoose,
  defaultLabel,
  defaultHex,
  compact,
  label: rowLabel,
}: {
  current: string | null
  currentText: string
  onChoose: (hex: string | null) => void
  defaultLabel: string
  defaultHex: string
  compact?: boolean
  label?: string
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // ラベル編集・色選択のダイアログ（body 直下・data-popover-keep）の中は「内側」
  useDismiss({ open, onClose: () => setOpen(false), inside: [ref] })
  useEffect(() => {
    // カードの下のほうで開いたとき、色の一覧が隠れないように見える位置まで送る
    if (open) ref.current?.scrollIntoView?.({ block: 'nearest' })
  }, [open])

  const choose = (hex: string | null) => {
    onChoose(hex)
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
          <span className="gc-dot h-3.5 w-3.5 shrink-0 rounded-full" style={colorVars(current ?? defaultHex)} aria-hidden />
          <span>{currentText}</span>
          <CaretDownIcon className="h-3 w-3 text-zinc-500" />
        </button>
      </div>

      {open && (
        <div className="mt-2">
          <ColorPalette
            selectedHex={current}
            onChoose={choose}
            onDefault={() => choose(null)}
            defaultLabel={defaultLabel}
            defaultHex={defaultHex}
            fill={compact}
          />
        </div>
      )}
    </div>
  )
}
