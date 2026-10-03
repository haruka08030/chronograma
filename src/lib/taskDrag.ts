/**
 * ToDo のネイティブドラッグの「運ぶ側」と「受ける側」。
 * 運ぶ側の effectAllowed と受ける側の dropEffect が合わないとブラウザが drop を捨てるので、
 * 画面ごとに書かずに必ずここを通す。
 */

export const TASK_DND_TYPE = 'application/x-task-id'
/** Google の予定をつかんでいるときの型（中身は予定 ID。本体は googleEventEdit が持つ） */
export const GOOGLE_EVENT_DND_TYPE = 'application/x-gcal-event'
/** 複数選択ドラッグ時に運ぶ、表示順の taskId 配列（JSON） */
export const TASK_MULTI_DND_TYPE = 'application/x-task-ids'

/** 落とし先がドラッグを受けられるときの見た目 */
export const DROP_HIGHLIGHT_CLASS = 'bg-accent-50 ring-2 ring-inset ring-accent-400 dark:bg-accent-500/10'

/** ToDo をつかむ。どの落とし先（予定に入れる＝copy / 動かす＝move）でも受けられるよう copyMove で渡す */
export function startTaskDrag(e: React.DragEvent, taskId: string, group?: string[]) {
  e.dataTransfer.setData(TASK_DND_TYPE, taskId)
  e.dataTransfer.setData('text/plain', taskId)
  if (group && group.length > 1) e.dataTransfer.setData(TASK_MULTI_DND_TYPE, JSON.stringify(group))
  e.dataTransfer.effectAllowed = 'copyMove'
}

export function isTaskDrag(e: React.DragEvent, { googleEvents = false } = {}): boolean {
  const types = e.dataTransfer.types
  return types.includes(TASK_DND_TYPE) || (googleEvents && types.includes(GOOGLE_EVENT_DND_TYPE))
}

/**
 * dragover で呼ぶ。ToDo（googleEvents なら Google の予定も）なら落とせる状態にして true を返す。
 * dropEffect は運ぶ側の許可に合わせる（Google の予定は move だけ許している）
 */
export function acceptTaskDrag(e: React.DragEvent, options?: { googleEvents?: boolean }): boolean {
  if (!isTaskDrag(e, options)) return false
  e.preventDefault()
  e.dataTransfer.dropEffect = e.dataTransfer.effectAllowed === 'move' ? 'move' : 'copy'
  return true
}
