import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { CALENDAR_COLORS } from '../../lib/googleColors'
import { categoryHex, colorVars } from '../../lib/logCategoryColors'
import { lazyNamed } from '../../lib/lazyComponent'
import { OverlaySuspense } from '../ui/OverlaySuspense'
import { PencilIcon } from '../icons'
import { ColorSwatches } from '../ui/ColorSwatches'
import { ColorDot } from '../ui/FilterChips'
import { chipClass } from '../ui/chipClass'
import { tip } from '../../lib/tooltip'

/** ラベルの編集（✎ で開いたときだけ読む。色の一覧は起動時の画面にもある） */
const LabelsDialog = lazyNamed(() => import('./LabelsDialog'), 'LabelsDialog')

/**
 * Google カレンダーの色選択と同じパネル: ✎（ラベルを編集）・名前の付いたラベルのチップ・名前の無い色の丸・下の「既定」ボタン。
 * ラベル名は丸のヒントに隠さず、「● 名前」のチップで見せる（スマホにはヒントが無い。#596）。丸は同じ色を 2 か所に出さないよう、名前の無い色だけ。
 * 記録・予定・習慣の色と Google の予定の色で使う。
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
  /** 色の丸を置き場所の幅いっぱいに並べる（幅 320px の予定のカード・右クリックの中のメニュー。12 列だとはみ出す） */
  fill?: boolean
}) {
  const { t } = useTranslation()
  const presets = useTaskStore((s) => s.timeLogTagPresets)
  const colors = useTaskStore((s) => s.logCategoryColors)
  const [editingLabels, setEditingLabels] = useState(false)

  // 名前の付いたラベル（並び順のまま・同じ色は先の名前）と、名前の無い 24 色
  const { labels, swatches } = useMemo(() => {
    const labels: { name: string; hex: string }[] = []
    for (const name of presets) {
      const hex = categoryHex(name, colors).toUpperCase()
      if (!labels.some((l) => l.hex === hex)) labels.push({ name, hex })
    }
    const named = new Set(labels.map((l) => l.hex))
    const swatches = CALENDAR_COLORS.filter((c) => !named.has(c.hex.toUpperCase())).map((c) => ({
      hex: c.hex,
      name: t(`googleColors.${c.key}`),
    }))
    return { labels, swatches }
  }, [presets, colors, t])
  const selected = selectedHex?.toUpperCase() ?? null

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
      {labels.length > 0 && (
        <div role="radiogroup" aria-label={t('labels.title')} className="mb-3 flex flex-wrap gap-1.5">
          {labels.map((l) => (
            <button
              key={l.hex}
              type="button"
              role="radio"
              aria-checked={selected === l.hex}
              onClick={() => onChoose(l.hex)}
              className={chipClass({ variant: 'outline', size: 'md', selected: selected === l.hex }, 'min-h-8 max-w-full')}
              style={colorVars(l.hex)}
            >
              <ColorDot hex={l.hex} />
              <span className="truncate">{l.name}</span>
            </button>
          ))}
        </div>
      )}
      {swatches.length > 0 && (
        <ColorSwatches ariaLabel={t('labels.pickerAria')} selectedHex={selectedHex} onChoose={onChoose} fill={fill} swatches={swatches} />
      )}
      {onDefault && (
        <button
          type="button"
          onClick={onDefault}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-200/70 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-700/60 dark:text-zinc-200 dark:hover:bg-zinc-700"
        >
          <span className="h-4 w-4 rounded-full border-[3px]" style={{ borderColor: defaultHex }} aria-hidden />
          {defaultLabel}
        </button>
      )}
      <OverlaySuspense onLoadFailed={() => setEditingLabels(false)}>
        {editingLabels && <LabelsDialog onClose={() => setEditingLabels(false)} />}
      </OverlaySuspense>
    </div>
  )
}
