import i18n from '../i18n/config'
import { useTaskStore } from '../store/taskStore'
import { colorLabelText } from './todoColorLabels'
import { displayListName } from './displayListName'
import { isLogTask } from '../types/task'

/**
 * To‑Do のナビ（リスト・色ラベル）にタスクを落としたときの処理。
 * つかみ方は 2 系統（手動並びの ⋮⋮＝dnd-kit、並べ替え中の行＝ネイティブ D&D）あるので、どちらもここを通す。
 */

/** リストに落とした: そのリストへ移す（複数選択はまとめて） */
export function moveDroppedTasks(taskIds: readonly string[], listId: string) {
  if (taskIds.length === 0) return
  const { moveTaskToList, moveTasksToList, showMoveBanner } = useTaskStore.getState()
  const r = taskIds.length > 1 ? moveTasksToList([...taskIds], listId) : moveTaskToList(taskIds[0], listId)
  if (r.moved && r.listName && r.listId != null) {
    showMoveBanner(i18n.t('toast.taskMovedToList', { name: displayListName(r.listId, r.listName) }))
  }
}

/** 色ラベルに落とした: その色（ラベル）を付ける（詳細の「ラベル」で選ぶのと同じく色だけ） */
export function labelDroppedTasks(taskIds: readonly string[], hex: string) {
  const state = useTaskStore.getState()
  const h = hex.toUpperCase()
  const targets = taskIds.filter((id) => {
    const t = state.tasks.find((x) => x.id === id)
    return t && !isLogTask(t) && t.color?.toUpperCase() !== h
  })
  if (targets.length === 0) return
  state.bulkUpdateTasks(targets, { color: h })
  state.showMoveBanner(
    i18n.t('toast.taskLabeled', {
      name: colorLabelText(h, state.timeLogTagPresets, state.logCategoryColors, i18n.t),
    }),
  )
}
