import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import type { Task } from '../types/task'
import { NEUTRAL_HEX } from '../lib/googleColors'
import { colorKeyForHex, labelForHex, recordHex } from '../lib/logCategoryColors'

/**
 * 予定・記録の色を選ぶ（予定カードの色ラベルと右クリックメニューで共通）。
 * - 記録: 色＝ラベル。名前の付いた色を選ぶとその分類に、名前の無い色は色だけ付く。既定（null）は「分類なし」
 * - 予定（`plan`）: 色だけ付ける（To-Do のタグは分類とは別物なので書き換えない）。既定（null）も「ラベルなし」。リストの色は使わない
 */
export function useTaskColor(task: Task, plan = false) {
  const { t } = useTranslation()
  const presets = useTaskStore((s) => s.timeLogTagPresets)
  const colors = useTaskStore((s) => s.logCategoryColors)
  const updateTask = useTaskStore((s) => s.updateTask)
  const isPlan = plan
  const current = isPlan
    ? task.color?.toUpperCase() ?? null
    : task.category || task.color ? recordHex(task, colors).toUpperCase() : null
  // 予定は色だけ持つが、その色にラベル（分類名）が付いていれば色名ではなくラベル名で出す
  const label = isPlan ? labelForHex(current, presets, colors) : task.category
  const currentKey = colorKeyForHex(current)
  const defaultLabel = t('labels.none')
  const choose = (hex: string | null) => {
    if (isPlan) updateTask(task.id, { color: hex })
    else if (hex === null) updateTask(task.id, { category: null, color: null })
    else {
      const name = labelForHex(hex, presets, colors)
      updateTask(task.id, name ? { category: name, color: null } : { category: null, color: hex })
    }
  }
  return {
    current,
    /** 今の色の呼び名（ラベル名 → 色名 → 既定） */
    currentText: label ?? (currentKey ? t(`googleColors.${currentKey}`) : current ?? defaultLabel),
    choose,
    defaultLabel,
    defaultHex: NEUTRAL_HEX,
  }
}
