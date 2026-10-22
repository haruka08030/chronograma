import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { usePlanColorText } from './useTaskColor'
import { categoryHex, labelForHex, type LogLabel } from '../lib/logCategoryColors'

/** 記録のラベルの今の色・呼び名と、色を選んだとき（名前の付いた色 → 分類、名前の無い色 → 色だけ、null → ラベルなし） */
export function useLogLabelChoice(value: string, color: string | null | undefined, onChange: (v: LogLabel) => void) {
  const { t } = useTranslation()
  const presets = useTaskStore((s) => s.timeLogTagPresets)
  const colors = useTaskStore((s) => s.logCategoryColors)
  const current = value ? categoryHex(value, colors) : (color?.toUpperCase() ?? null)
  const colorText = usePlanColorText(current)
  return {
    current,
    /** ラベル名 → 色名 → 「ラベルなし」 */
    text: value || colorText,
    defaultLabel: t('labels.none'),
    choose: (hex: string | null) => {
      if (!hex) return onChange({ tags: [], color: null })
      const name = labelForHex(hex, presets, colors)
      onChange(name ? { tags: [name], color: null } : { tags: [], color: hex })
    },
  }
}
