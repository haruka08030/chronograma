/**
 * タスクの行の選択・キーの枠の見た目（To-Do 一覧の行と今日の計画の行で共通）。
 * - ROW_SELECTED_CLASS: 複数選択で選んでいる行
 * - ROW_CURSOR_CLASS: ↑↓ で動かしている行（キーで動かしている間だけ）。色はボタンのフォーカスの枠（index.css）と同じ
 * - ROW_PRESS_CLASS: 押している間。タッチではホバーの色が出ない（Tailwind 4 の hover: はマウスだけ）ので、押せたことをこれで見せる
 */
export const ROW_SELECTED_CLASS = 'bg-accent-50/70 dark:bg-accent-500/10'

export const ROW_CURSOR_CLASS = 'bg-zinc-50 ring-2 ring-inset ring-date-400/70 dark:bg-zinc-800/40 dark:ring-date-400/60'

export const ROW_PRESS_CLASS = 'active:bg-zinc-100 dark:active:bg-zinc-800/60'
