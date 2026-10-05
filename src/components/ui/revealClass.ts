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

/**
 * `group/row` の行で、乗せたときだけ場所を取って出す操作（今日の計画の行の ▶・→・時計）。
 * 透明で場所を取ったままにすると、隠れている間もタイトルが短く切られるので、乗せていない間は消しておく。
 * 代わりに乗せている間は行の時刻・締切（`HIDE_ON_ROW_HOVER`）を消して、同じ所にボタンを出す（Gmail の行と同じ）
 */
export const SHOW_ON_ROW_HOVER =
  '[@media(hover:hover)]:hidden [@media(hover:hover)]:group-hover/row:inline-flex [@media(hover:hover)]:group-focus-within/row:inline-flex'

/** `SHOW_ON_ROW_HOVER` のボタンが出ている間は隠す行の情報（時刻・締切） */
export const HIDE_ON_ROW_HOVER =
  '[@media(hover:hover)]:group-hover/row:hidden [@media(hover:hover)]:group-focus-within/row:hidden'
