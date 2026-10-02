import i18n from '../i18n/config'
import { useTaskStore } from '../store/taskStore'
import { colorLabelText } from './todoColorLabels'

/**
 * ナビの色ラベルにタスクを落としたとき: その色（ラベル）を付ける（詳細の「ラベル」で選ぶのと同じく色だけ）。
 * つかみ方は 2 系統（手動並びの ⋮⋮＝dnd-kit、並べ替え中の行＝ネイティブ D&D）あるので、どちらもここを通す。
 */
export function labelDroppedTasks(taskIds: readonly string[], hex: string) {
  const state = useTaskStore.getState()
  const h = hex.toUpperCase()
  const targets = taskIds.filter((id) => {
    const t = state.tasks.find((x) => x.id === id)
    return t && !t.isTimeLog && t.color?.toUpperCase() !== h
  })
  if (targets.length === 0) return
  state.bulkUpdateTasks(targets, { color: h })
  state.showMoveBanner(
    i18n.t('toast.taskLabeled', {
      name: colorLabelText(h, state.timeLogTagPresets, state.logCategoryColors, i18n.t),
    }),
  )
}
