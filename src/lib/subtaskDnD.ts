/** 一覧内サブタスク行のドラッグ元（ルートの `task::` と区別） */
export const SUBTASK_PREFIX = 'subtask::'

export function subtaskDragId(taskId: string): string {
  return `${SUBTASK_PREFIX}${taskId}`
}

export function parseSubtaskDragId(id: string): string | null {
  if (!id.startsWith(SUBTASK_PREFIX)) return null
  const taskId = id.slice(SUBTASK_PREFIX.length)
  return taskId || null
}
