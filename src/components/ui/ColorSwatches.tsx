import { useTranslation } from 'react-i18next'
import { CALENDAR_COLORS, textOnHex } from '../../lib/googleColors'
import { CheckIcon } from '../icons'
import { tip } from '../../lib/tooltip'

/** 丸の直径（24px） */
const SWATCH_SIZE = '1.5rem'

export interface Swatch {
  hex: string
  /** ツールチップ・読み上げ（省略時は Google の色名） */
  name?: string
}

/**
 * 色の丸を並べる部品（リスト・習慣・ラベル・予定の色で共通）。Google カレンダーの 24 色を 12 列（狭い所は 6 列）で、
 * 選んでいる色にはチェック。丸の大きさはどこでも同じ（置き場所の幅で変えない）。外枠（ポップオーバー・カード）や前後のボタンは使う側で付ける。
 */
export function ColorSwatches({
  selectedHex,
  onChoose,
  ariaLabel,
  swatches,
  columns = 12,
  className = '',
}: {
  selectedHex: string | null
  onChoose: (hex: string) => void
  ariaLabel: string
  /** 省略時は 24 色。自分で作った色を足すときに渡す */
  swatches?: readonly Swatch[]
  /** 狭いポップオーバー（ナビのリストの色）は 6 */
  columns?: 6 | 12
  className?: string
}) {
  const { t } = useTranslation()
  const list = swatches ?? CALENDAR_COLORS.map((c) => ({ hex: c.hex, name: t(`googleColors.${c.key}`) }))
  const selected = selectedHex?.toUpperCase() ?? null
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`grid w-max gap-1.5 ${className}`}
      style={{ gridTemplateColumns: `repeat(${columns}, ${SWATCH_SIZE})` }}
    >
      {list.map((sw) => {
        const isSelected = selected === sw.hex.toUpperCase()
        const name = sw.name ?? sw.hex
        return (
          <button
            key={sw.hex}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={name}
            {...tip(name)}
            onClick={() => onChoose(sw.hex)}
            className="flex aspect-square w-full items-center justify-center rounded-full transition-transform hover:scale-110"
            style={{ backgroundColor: sw.hex, color: textOnHex(sw.hex) }}
          >
            {isSelected && <CheckIcon className="h-3 w-3" strokeWidth={3.5} />}
          </button>
        )
      })}
    </div>
  )
}
