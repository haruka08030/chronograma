/**
 * 行に乗せたときだけ出す操作（鉛筆・×・並べ替えのつまみ など）。
 * 隠すかどうかは画面の幅ではなく「マウスで乗せられるか」（`hover: hover`）で決める。
 * 幅で決めると、iPad のようにタッチの広い画面で透明のまま押せなくなる。タッチでは常に出す。
 * キーボードで行に入ったとき（focus-within）も出す。
 */
export const REVEAL_ON_HOVER =
  '[@media(hover:hover)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100'

/** `group/row` の行用（今日の計画の行など、内側に別の `group` がある行） */
export const REVEAL_ON_ROW_HOVER =
  '[@media(hover:hover)]:opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:opacity-100'
