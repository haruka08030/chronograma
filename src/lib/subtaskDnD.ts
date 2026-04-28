/** 一覧内サブタスク行のドラッグ元（ルートの `task::` と区別） */
export const SUBTASK_PREFIX = 'subtask::'

/** 親ルートタスク配下へサブタスクを入れるドロップ先 */
export const NEST_DROP_PREFIX = 'nest::'

export function subtaskDragId(taskId: string): string {
  return `${SUBTASK_PREFIX}${taskId}`
}

export function nestDropId(parentTaskId: string): string {
  return `${NEST_DROP_PREFIX}${parentTaskId}`
}

export function parseSubtaskDragId(id: string): string | null {
  if (!id.startsWith(SUBTASK_PREFIX)) return null
  const taskId = id.slice(SUBTASK_PREFIX.length)
  return taskId || null
}

export function parseNestDropId(id: string): string | null {
  if (!id.startsWith(NEST_DROP_PREFIX)) return null
  const parentId = id.slice(NEST_DROP_PREFIX.length)
  return parentId || null
}
