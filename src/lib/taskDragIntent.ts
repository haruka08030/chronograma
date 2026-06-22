/** 左方向にこの px 以上ドラッグしたらサブタスクを 1 段上へ昇格（インデント約 1 段分） */
export const UNNEST_DRAG_DELTA = 24
/** 右方向にこの px 以上ドラッグしたらタスクを 1 段下げる（直前の兄弟の子に） */
export const NEST_DRAG_DELTA = 24

export type DragDelta = { x: number; y: number }

/** 横移動が縦移動より大きいときだけ階層操作（縦の並べ替えを誤爆させない） */
export function isHorizontalDominant(delta: DragDelta): boolean {
  return Math.abs(delta.x) > Math.abs(delta.y)
}

/** 右ドラッグで 1 段下げる（直前の兄弟の子に）意図 */
export function isIndentIntent(delta: DragDelta): boolean {
  return isHorizontalDominant(delta) && delta.x >= NEST_DRAG_DELTA
}

/** 左ドラッグで 1 段上げる意図 */
export function isOutdentIntent(delta: DragDelta): boolean {
  return isHorizontalDominant(delta) && delta.x <= -UNNEST_DRAG_DELTA
}
