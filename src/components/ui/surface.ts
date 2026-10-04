/**
 * 画面の上に浮かぶ面（ダイアログ・予定カード・ドロップダウン）の見た目。どれも同じにする。
 * ダークでは下の画面（zinc-900）より一段明るい zinc-800 にして、浮いていることが分かるようにする。
 * 中のホバーはダークで zinc-700 を使う（zinc-800 だと面と同じ色で見えない）。
 */
export const FLOATING_SURFACE = 'border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800'

/**
 * 濃い色で浮かせる小さな面（元に戻すトースト・移動のトースト・選択中の件数・ヒント）。
 * 画面の上の「知らせ」なので、ライトでは墨、ダークでは明るいグレーに反転させる
 */
export const INVERSE_SURFACE = 'bg-zinc-900 text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900'

/**
 * 浮く面の中の行（メニュー・時刻の候補）のハイライト。↑↓ で選んでいる行は `MENU_ROW_ACTIVE`、
 * そうでない行はホバーで同じ色にする（キー操作とマウスで同じ見た目）
 */
export const MENU_ROW_ACTIVE = 'bg-zinc-100 dark:bg-zinc-700'
export const MENU_ROW_HOVER = 'hover:bg-zinc-100 dark:hover:bg-zinc-700'

/**
 * ボタンの下に開くドロップダウン（日付・メニュー・色・アカウント）。小さく拡大しながら出る。
 * 出る起点は置き場所に合わせて足す（ボタンの左下に開くなら `origin-top-left`、右寄せなら `origin-top-right`）
 */
export const POPOVER_PANEL = `${FLOATING_SURFACE} rounded-xl shadow-xl animate-pop-in`

/**
 * タイムラインの予定を押したときのカード（新規作成・予定・Google の予定）。
 * スマホでは下から出るシート（`sheet`）、PC では押した所の横に小さく出る。
 */
export function anchoredCardClass(sheet: boolean): string {
  return `fixed z-[60] ${FLOATING_SURFACE} shadow-2xl outline-none ${
    sheet ? 'animate-sheet-in rounded-t-2xl pb-[calc(1rem+env(safe-area-inset-bottom))]' : 'animate-pop-in rounded-2xl'
  }`
}
