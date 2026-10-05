/**
 * 習慣の丸の「達成」と「時間外」（やったが決めた時間とは違う時間）。今日画面と習慣画面で同じ見た目にする。
 * 色は style の `--c` / `--on-c`（`colorVars(習慣の色)`）で渡す。
 * - 達成 = 習慣の色の塗り＋✓
 * - 時間外 = 習慣の色を 35% にした塗り＋✓。丸の下に `HABIT_OFF_TIME_TEXT` で「時間外」と書く
 *   （習慣画面の週のマスはカードの余白に小さく。時刻はツールチップと読み上げ名で伝える）
 */
export const HABIT_DONE_FILL = 'bg-[var(--c)] text-[var(--on-c)]'
export const HABIT_OFF_TIME_FILL = 'bg-[color-mix(in_srgb,var(--c)_35%,transparent)] text-[var(--on-c)]'

/** 丸の下の「時間外」の文字。締切のオレンジと紛れないようにグレー */
export const HABIT_OFF_TIME_TEXT = 'text-zinc-400 dark:text-zinc-500'
