/**
 * 小見出しの見た目（アプリ全体で 2 段だけ）。大きさはどちらも text-xs・font-medium で、色だけ変える。
 * - section: パネル・カード・ナビの中のまとまりの見出し（日パネルの「完了 n 件」、ナビの「ラベル」、
 *   習慣の「この日の習慣」、ふりかえりの「日ごとの記録時間」）。薄い灰色で、中身より目立たせない
 * - field: フォームの欄の名前（タスク詳細の「期限」「リスト」、開始/終了の「日付」「時刻」、習慣の「色」）。
 *   入力欄のすぐ上・横に置くので section より一段濃い
 *
 * 画面の題（h1）・今日の計画の区切りの見出し（To-Do・習慣。太い黒）・カードの題・開閉する見出し（`DisclosureButton`）・
 * メニューの区切り（`MenuLabel`）・リストのセクション名（`SECTION_HEADING_TEXT`）はそれぞれ別の役割なので使わない。
 * タグは `SectionLabel` で選ぶ。`<label htmlFor>` などはこの class を直接付ける。
 */
export type SectionLabelLevel = 'section' | 'field'

const LEVEL: Record<SectionLabelLevel, string> = {
  section: 'text-xs font-medium text-zinc-400 dark:text-zinc-500',
  field: 'text-xs font-medium text-zinc-500 dark:text-zinc-400',
}

export function sectionLabelClass(level: SectionLabelLevel = 'section', extra = ''): string {
  return extra ? `${LEVEL[level]} ${extra}` : LEVEL[level]
}
