/**
 * 習慣の丸の見た目。今日画面と習慣画面で同じにする。色は style の `--c`（`colorVars(習慣の色)`）で渡す。
 * 線画でそろえ、塗るのは「達成」だけ（index.css の `gc-mark*`）。
 * - まだ = その色の細い輪（`HABIT_PENDING`）
 * - 達成 = 薄い塗り＋その色の輪＋✓（`HABIT_DONE_FILL`）
 * - 時間外（やったが決めた時間とは違う時間）= その色の点線の輪＋✓（`HABIT_OFF_TIME_FILL`）。丸の下に `HABIT_OFF_TIME_TEXT` で「時間外」と書く
 *   （習慣画面の週のマスはカードの余白に小さく。時刻はツールチップと読み上げ名で伝える）
 */
export const HABIT_PENDING = 'gc-mark'
export const HABIT_DONE_FILL = 'gc-mark-done'
export const HABIT_OFF_TIME_FILL = 'gc-mark-off'

/** 丸の下の「時間外」の文字。締切のオレンジと紛れないようにグレー */
export const HABIT_OFF_TIME_TEXT = 'text-zinc-400 dark:text-zinc-500'
