import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLabeledSwatches } from '../../hooks/useLabeledSwatches'
import { lazyNamed } from '../../lib/lazyComponent'
import { OverlaySuspense } from '../ui/OverlaySuspense'
import { PencilIcon } from '../icons'
import { ColorSwatches } from '../ui/ColorSwatches'
import { tip } from '../../lib/tooltip'

/** ラベルの編集（✎ で開いたときだけ読む。色の一覧は起動時の画面にもある） */
const LabelsDialog = lazyNamed(() => import('./LabelsDialog'), 'LabelsDialog')

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
  vague,
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
  /** 記録のラベルだけ: 「なんとなく」（#657）を既定ボタンの上に出す。`selected` は今「なんとなく」か */
  vague?: { selected: boolean; onChoose: () => void }
}) {
  const { t } = useTranslation()
  const [editingLabels, setEditingLabels] = useState(false)

  // 24 色の後ろに、24 色に無い色のラベル（自分で作った色）
  const swatches = useLabeledSwatches(true)

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
      <ColorSwatches ariaLabel={t('labels.pickerAria')} selectedHex={selectedHex} onChoose={onChoose} fill={fill} swatches={swatches} />
      {vague && (
        <button
          type="button"
          onClick={vague.onChoose}
          aria-pressed={vague.selected}
          {...tip(t('labels.vagueHint'))}
          className={`mt-3 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-zinc-700 ring-1 transition-colors dark:text-zinc-200 ${
            vague.selected
              ? 'bg-white ring-zinc-400 dark:bg-zinc-800 dark:ring-zinc-500'
              : 'ring-zinc-200 hover:bg-white dark:ring-zinc-700 dark:hover:bg-zinc-800'
          }`}
        >
          <span className="gc-vague h-4 w-4 shrink-0 rounded-full" aria-hidden />
          <span className="min-w-0">
            <span className="block">{t('labels.vague')}</span>
            {/* ホバーの無い端末（スマホ）はヒントの代わりに、開いたときだけ説明を下に */}
            <span className="hidden text-xs text-zinc-500 [@media(hover:none)]:block dark:text-zinc-400">{t('labels.vagueHint')}</span>
          </span>
        </button>
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
