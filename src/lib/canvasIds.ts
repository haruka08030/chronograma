/**
 * Canvas のリスト id。同期のマージ（syncMerge）からも使うので、Supabase を読み込む canvas.ts とは分けて置く。
 * どの学校の課題も 1 つの「Canvas」リストに入れる。以前は学校ごとに `canvas-list-<接続>` があった。
 */
export const CANVAS_LIST_ID = 'canvas-list'

/** Canvas のリストか（学校ごとに分かれていた版の id も含む） */
export function isCanvasListId(id: string): boolean {
  return id === CANVAS_LIST_ID || id.startsWith(`${CANVAS_LIST_ID}-`)
}
