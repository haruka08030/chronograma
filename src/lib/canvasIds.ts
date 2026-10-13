/**
 * Canvas のリスト id。同期のマージ（syncMerge）からも使うので、Supabase を読み込む canvas.ts とは分けて置く。
 * どの学校の課題も 1 つの「Canvas」リストに入れる。以前は学校ごとに `canvas-list-<接続>` があった。
 */
export const CANVAS_LIST_ID = 'canvas-list'

/** Canvas のリストか（学校ごとに分かれていた版の id も含む） */
export function isCanvasListId(id: string): boolean {
  return id === CANVAS_LIST_ID || id.startsWith(`${CANVAS_LIST_ID}-`)
}

const TASK_ID_RE = /^canvas-([a-z0-9.-]+)-(assignment|quiz|discussion_topic|wiki_page|planner_note)-(\d+)$/

/** LMS（Canvas・Moodle）から取り込んだタスクの id（`canvas-<接続>-<種類>-<ID>`）を分ける。違う形なら null */
export function parseCanvasTaskId(id: string): { connectionId: string; type: string; id: string } | null {
  const m = TASK_ID_RE.exec(id)
  return m ? { connectionId: m[1], type: m[2], id: m[3] } : null
}
