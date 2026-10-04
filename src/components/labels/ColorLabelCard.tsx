import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { CALENDAR_COLORS } from '../../lib/googleColors'
import { colorKeyForHex, labelForHex } from '../../lib/logCategoryColors'
import { colorLabelEditRows } from '../../lib/todoColorLabels'
import { tip } from '../../lib/tooltip'
import { useDismiss } from '../../hooks/useDismiss'
import { useTextEntry } from '../../hooks/useTextEntry'
import { anchoredCardStyle, type AnchorRect } from '../timeline/anchoredCard'
import { anchoredCardClass } from '../ui/surface'
import { ColorSwatches } from '../ui/ColorSwatches'
import { iconButtonClass } from '../ui/iconButtonClass'
import { TrashIcon } from '../icons'
import { LABEL_NAME_INPUT_CLASS } from './labelNameInputClass'

const WIDTH = 232

/**
 * To‑Do ナビの色ラベルの丸を押したときの小さなカード（Google カレンダーのラベル編集と同じ）。
 * 名前＋24 色＋削除。Enter・外を押すと保存、Esc は保存せずに閉じる。保存は「ラベルを編集」と同じ `saveLogLabels`
 * （色を変えたらその色の予定・タスクも新しい色へ、削除は「元に戻す」トースト）。
 * 名前の無い色は、名前を書くとその色のラベルになる。PC は行の横、スマホは下からのシート。
 */
export function ColorLabelCard({ hex, anchor, onClose }: { hex: string; anchor: AnchorRect; onClose: () => void }) {
  const { t } = useTranslation()
  const presets = useTaskStore((s) => s.timeLogTagPresets)
  const colors = useTaskStore((s) => s.logCategoryColors)
  const saveLogLabels = useTaskStore((s) => s.saveLogLabels)
  const current = labelForHex(hex, presets, colors)
  const [name, setName] = useState(current ?? '')
  const [color, setColor] = useState(hex.toUpperCase())
  const ref = useRef<HTMLDivElement>(null)

  // 24 色に無い色（自分で作った色）は後ろに足して、選んでいることが分かるようにする
  const swatches = useMemo(() => {
    const base = CALENDAR_COLORS.map((c) => ({ hex: c.hex, name: t(`googleColors.${c.key}`) }))
    return colorKeyForHex(hex) ? base : [...base, { hex: hex.toUpperCase() }]
  }, [hex, t])

  const save = () => {
    const trimmed = name.trim()
    const renamed = trimmed !== '' && trimmed !== (current ?? '')
    if (renamed || color !== hex.toUpperCase()) {
      saveLogLabels(colorLabelEditRows(hex, { name: trimmed, hex: color }, presets, colors))
    }
    onClose()
  }
  const remove = () => {
    saveLogLabels(colorLabelEditRows(hex, null, presets, colors))
    onClose()
  }

  useDismiss({ open: true, onClose: save, onEscape: onClose, inside: [ref] })
  const entry = useTextEntry({ onSubmit: save, onCancel: onClose, commitOnBlur: false })

  const { style, sheet } = anchoredCardStyle(anchor, WIDTH, current ? 230 : 190)

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={t('labels.editOne')}
      // ナビのドロワー（スマホ）からは「内側」（押してもドロワーを閉じない）
      data-popover-keep
      className={`${anchoredCardClass(sheet)} p-4`}
      style={style}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        // スマホ（シート）ではキーボードで色が隠れるので、欄を押すまで出さない
        autoFocus={!sheet}
        value={name}
        onChange={(e) => setName(e.target.value)}
        {...entry}
        aria-label={t('labels.name')}
        placeholder={t('labels.placeholder')}
        className={`w-full ${LABEL_NAME_INPUT_CLASS}`}
      />
      <ColorSwatches
        ariaLabel={t('labels.changeColor')}
        columns={6}
        selectedHex={color}
        onChoose={setColor}
        swatches={swatches}
        className="mt-3"
      />
      {current && (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={remove}
            {...tip(t('labels.remove'), { name: true })}
            className={iconButtonClass('-mb-2 -mr-2')}
          >
            <TrashIcon className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </div>
      )}
    </div>,
    document.body,
  )
}
