import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { CALENDAR_COLORS } from '../lib/googleColors'
import { categoryHex, colorKeyForHex, labelForHex } from '../lib/logCategoryColors'
import type { Swatch } from '../components/ui/ColorSwatches'

/**
 * 色の丸のヒントに出す名前つきの 24 色: 設定のラベルで名前を付けた色は「ラベル名（色名）」、無ければ色名（「セージ」など）。
 * 記録・予定のパレットと To-Do リストの色で同じ名前を出す。`withCustom` は 24 色の後ろに 24 色に無い色のラベル（自分で作った色）を足す
 */
export function useLabeledSwatches(withCustom = false): Swatch[] {
  const { t } = useTranslation()
  const presets = useTaskStore((s) => s.timeLogTagPresets)
  const colors = useTaskStore((s) => s.logCategoryColors)
  return useMemo(() => {
    const base = CALENDAR_COLORS.map((c) => ({ hex: c.hex, colorName: t(`googleColors.${c.key}`) }))
    const extra = withCustom
      ? presets
          .map((n) => categoryHex(n, colors))
          .filter((hex, i, arr) => !colorKeyForHex(hex) && arr.indexOf(hex) === i)
          .map((hex) => ({ hex, colorName: hex }))
      : []
    return [...base, ...extra].map((sw) => {
      const name = labelForHex(sw.hex, presets, colors)
      return { hex: sw.hex, name: name ? t('common.withNote', { title: name, note: sw.colorName }) : sw.colorName }
    })
  }, [presets, colors, t, withCustom])
}
