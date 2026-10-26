import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { colorKeyForHex, labelForHex } from '../lib/logCategoryColors'

type T = ReturnType<typeof useTranslation>['t']

/** 色の呼び名（24 色なら色名、それ以外は色の値、無ければ既定） */
export function colorNameText(t: T, hex: string | null, defaultLabel: string): string {
  const key = colorKeyForHex(hex)
  return key ? t(`googleColors.${key}`) : (hex ?? defaultLabel)
}

/**
 * 予定の色（＝ラベル）の呼び名（ラベル名 → 色名 → 「ラベルなし」）。タスクに付いていない色（よく入れる予定の登録など）で使う
 */
export function usePlanColorText(hex: string | null): string {
  const { t } = useTranslation()
  const presets = useTaskStore((s) => s.timeLogTagPresets)
  const colors = useTaskStore((s) => s.logCategoryColors)
  const current = hex?.toUpperCase() ?? null
  return labelForHex(current, presets, colors) ?? colorNameText(t, current, t('labels.none'))
}
