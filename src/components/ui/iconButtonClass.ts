/**
 * アイコンだけの丸いボタン（予定カードの右上の 詳細・削除・閉じる、ラベル編集の行の削除、習慣の編集カードの削除、
 * ゴミ箱・アーカイブの行の削除、セクションの見出しの名前変更・削除）。削除も赤くしない（Google カレンダーと同じ）。
 * Google カレンダーのイベントカードと同じく、枠なし・丸で、乗せたときだけ薄い地を出す。
 * 行の右端に並ぶ操作（記録を開始・今日やる）は枠ありの `RowActionButton` を使う。
 *
 * `<a>`（Google で開く）にも使えるよう class 文字列を返す。名前は `aria-label` と `tip()` で付ける。
 */
const ICON_BUTTON =
  'inline-flex shrink-0 items-center justify-center rounded-full p-2 text-zinc-500 transition-colors touch-manipulation hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-100'

export function iconButtonClass(extra = ''): string {
  return extra ? `${ICON_BUTTON} ${extra}` : ICON_BUTTON
}
