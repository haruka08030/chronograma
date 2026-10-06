/**
 * タスクの行の選択・キーの枠の見た目（To-Do 一覧の行と今日の計画の行で共通）。
 * - ROW_SELECTED_CLASS: 複数選択で選んでいる行
 * - ROW_CURSOR_CLASS: ↑↓ で動かしている行（キーで動かしている間だけ）。色はボタンのフォーカスの枠（index.css）と同じ
 * - ROW_PRESS_CLASS: 押している間。タッチではホバーの色が出ない（Tailwind 4 の hover: はマウスだけ）ので、押せたことをこれで見せる
 * - LIFT_CARD_CLASS / ROW_LIFTED_CLASS: つかんで持ち上げている行（ドラッグの見た目と、タッチの長押しで浮かせた行）
 */
/** 選んだ行はホバー（灰色）と見分けられる青の薄い塗り。行のホバー・キーの枠の塗りより優先し、乗せても灰色に戻らない */
export const ROW_SELECTED_CLASS = 'bg-date-50! hover:bg-date-100/70! dark:bg-date-500/15! dark:hover:bg-date-500/20!'

export const ROW_CURSOR_CLASS = 'bg-zinc-50 ring-2 ring-inset ring-date-400/70 dark:bg-zinc-800/40 dark:ring-date-400/60'

export const ROW_PRESS_CLASS = 'active:bg-zinc-100 dark:active:bg-zinc-800/60'

/** 持ち上げている行の影と縁（ドラッグの見た目 `DragOverlayTaskRow` の札と、重なって見える下の札） */
export const LIFT_CARD_CLASS = 'shadow-lg ring-1 ring-zinc-200/70 dark:ring-zinc-700/70'

/**
 * タッチの長押しで浮かせた行（運ばない行: 今日の計画・並べ替えのない To-Do）。少し大きく影を付ける。
 * 「視差効果を減らす」では大きくせず影だけ（出るときの動き animate-lift-in も index.css で止まる）
 */
export const LIFT_SCALE_CLASS = 'scale-[1.02] motion-reduce:scale-100 animate-lift-in'
export const ROW_LIFTED_CLASS = `relative z-10 bg-white dark:bg-zinc-900 ${LIFT_SCALE_CLASS} ${LIFT_CARD_CLASS}`
