import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { CALENDAR_COLORS } from '../../lib/googleColors'
import { CheckIcon } from '../icons'
import { tip } from '../../lib/tooltip'
import { colorVars } from '../../lib/logCategoryColors'

/** 丸の直径（24px） */
const SWATCH_SIZE = '1.5rem'

export interface Swatch {
  hex: string
  /** ツールチップ・読み上げ（省略時は Google の色名） */
  name?: string
}

/**
 * 色の丸を並べる部品（リスト・習慣・ラベル・予定の色で共通）。Google カレンダーの 24 色を 12 列（狭い所は 6 列）で、
 * 選んでいる色にはチェック。丸の大きさはどこでも同じ（予定のカードの中だけは `fill` で幅に合わせる）。外枠（ポップオーバー・カード）や前後のボタンは使う側で付ける。
 */
export function ColorSwatches({
  selectedHex,
  onChoose,
  ariaLabel,
  swatches,
  columns = 12,
  fill = false,
  className = '',
}: {
  selectedHex: string | null
  onChoose: (hex: string) => void
  ariaLabel: string
  /** 省略時は 24 色。自分で作った色を足すときに渡す */
  swatches?: readonly Swatch[]
  /** 狭いポップオーバー（ナビのリストの色）は 6 */
  columns?: 6 | 12
  /** 置き場所の幅いっぱいに 8 列で並べ、丸の大きさを幅に合わせる（予定のカードの中） */
  fill?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  const list = swatches ?? CALENDAR_COLORS.map((c) => ({ hex: c.hex, name: t(`googleColors.${c.key}`) }))
  const selected = selectedHex?.toUpperCase() ?? null
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      // 12 列（幅 354px）はスマホのカードに収まらないので、狭い画面では 6 列で折り返す
      className={`grid gap-1.5 ${fill ? 'w-full grid-cols-8' : `w-max ${columns === 12 ? 'grid-cols-[repeat(6,var(--sw))] sm:grid-cols-[repeat(12,var(--sw))]' : 'grid-cols-[repeat(6,var(--sw))]'}`} ${className}`}
      style={{ '--sw': SWATCH_SIZE } as CSSProperties}
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
            {...tip(name, { name: true })}
            onClick={() => onChoose(sw.hex)}
            className="gc-dot flex aspect-square w-full items-center justify-center rounded-full transition-transform hover:scale-110"
            style={colorVars(sw.hex)}
          >
            {isSelected && <CheckIcon className="h-3 w-3" strokeWidth={3.5} />}
          </button>
        )
      })}
    </div>
  )
}
