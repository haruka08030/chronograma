import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { CALENDAR_COLORS } from '../../lib/googleColors'
import { categoryHex, colorKeyForHex, labelForHex } from '../../lib/logCategoryColors'
import { LabelsDialog } from './LabelsDialog'
import { PencilIcon } from '../icons'
import { ColorSwatches } from '../ui/ColorSwatches'
import { tip } from '../../lib/tooltip'

/**
 * Google カレンダーの色選択と同じパネル: ✎（ラベルを編集）・24 色＋自分で作った色・下の「既定」ボタン。
 * 色の丸のツールチップは「ラベル名（色名）」。記録・予定・習慣の色と Google の予定の色で使う。
 * 色が必ずあるもの（習慣）は `onDefault` を渡さず、既定ボタンを出さない。
 */
export function ColorPalette({
  selectedHex,
  onChoose,
  onDefault,
  defaultLabel,
  defaultHex,
  bare = false,
  fill = false,
}: {
  selectedHex: string | null
  onChoose: (hex: string) => void
  onDefault?: () => void
  defaultLabel?: string
  /** 既定ボタンの輪の色 */
  defaultHex?: string
  /** 枠なし（メニューの中など、すでに浮く面の上に置くとき） */
  bare?: boolean
  /** 色の丸をカードの幅いっぱいに並べる（幅 320px の予定のカード。12 列だとはみ出す） */
  fill?: boolean
}) {
  const { t } = useTranslation()
  const presets = useTaskStore((s) => s.timeLogTagPresets)
  const colors = useTaskStore((s) => s.logCategoryColors)
  const [editingLabels, setEditingLabels] = useState(false)

  // 24 色の後ろに、24 色に無い色のラベル（自分で作った色）
  const swatches = useMemo(() => {
    const base = CALENDAR_COLORS.map((c) => ({ hex: c.hex, colorName: t(`googleColors.${c.key}`) }))
    const extra = presets
      .map((n) => categoryHex(n, colors))
      .filter((hex, i, arr) => !colorKeyForHex(hex) && arr.indexOf(hex) === i)
      .map((hex) => ({ hex, colorName: hex }))
    return [...base, ...extra]
  }, [presets, colors, t])

  return (
    <div className={bare ? 'p-1' : 'rounded-2xl bg-zinc-50 p-3 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900/60 dark:ring-zinc-700'}>
      <button
        type="button"
        onClick={() => setEditingLabels(true)}
        {...tip(t('labels.edit'), { name: true })}
        className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-zinc-700 shadow ring-1 ring-zinc-200 transition-colors hover:bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-200 dark:ring-zinc-600 dark:hover:bg-zinc-700"
      >
        <PencilIcon className="h-4 w-4" strokeWidth={1.75} />
      </button>
      <ColorSwatches
        ariaLabel={t('labels.pickerAria')}
        selectedHex={selectedHex}
        onChoose={onChoose}
        fill={fill}
        swatches={swatches.map((sw) => {
          const name = labelForHex(sw.hex, presets, colors)
          return { hex: sw.hex, name: name ? `${name}（${sw.colorName}）` : sw.colorName }
        })}
      />
      {onDefault && <button
        type="button"
        onClick={onDefault}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-200/70 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-700/60 dark:text-zinc-200 dark:hover:bg-zinc-700"
      >
        <span className="h-4 w-4 rounded-full border-[3px]" style={{ borderColor: defaultHex }} aria-hidden />
        {defaultLabel}
      </button>}
      {editingLabels && <LabelsDialog onClose={() => setEditingLabels(false)} />}
    </div>
  )
}
