/**
 * 画面の上に浮かぶ面（ダイアログ・予定カード・ドロップダウン）の見た目。どれも同じにする。
 * ダークでは下の画面（zinc-900）より一段明るい zinc-800 にして、浮いていることが分かるようにする。
 * 中のホバーはダークで zinc-700 を使う（zinc-800 だと面と同じ色で見えない）。
 */
export const FLOATING_SURFACE = 'border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800'

/** ボタンの下に開くドロップダウン（日付・メニュー・色・アカウント） */
export const POPOVER_PANEL = `${FLOATING_SURFACE} rounded-xl shadow-xl`

/**
 * タイムラインの予定を押したときのカード（新規作成・予定・Google の予定）。
 * スマホでは下から出るシート（`sheet`）、PC では押した所の横に小さく出る。
 */
export function anchoredCardClass(sheet: boolean): string {
  return `fixed z-[60] ${FLOATING_SURFACE} shadow-2xl outline-none ${
    sheet ? 'animate-sheet-in rounded-t-2xl pb-[calc(1rem+env(safe-area-inset-bottom))]' : 'animate-pop-in rounded-2xl'
  }`
}
