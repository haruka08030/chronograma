/**
 * 「今日」と「選んだ日」の印。カレンダー・日付ピッカー・ミニカレンダー・習慣・睡眠で同じ見た目にする。
 * - 今日 = 藍の塗り（塗れないところは藍の文字）
 * - 選んだ日 = 藍の枠
 * 色は `--color-date-*`（日付だけは墨色ではなく藍）。
 */

/** 日付の丸（数字や曜日）に付ける。今日かつ選んだ日なら、塗りの外側に枠を重ねる */
export function dayMarkerClass({ today, selected }: { today: boolean; selected: boolean }): string {
  if (today && selected) return `${TODAY_FILL} ring-2 ring-date-400 ring-offset-2 ring-offset-white dark:ring-offset-zinc-900`
  if (today) return TODAY_FILL
  if (selected) return SELECTED_RING
  return ''
}

const TODAY_FILL = 'bg-date-500 font-semibold text-white'
const SELECTED_RING = 'font-semibold text-date-700 ring-2 ring-date-400 dark:text-date-300'

/** 塗れないところ（曜日の見出し・グラフの目盛り・達成の色で塗る丸）の「今日」 */
export const TODAY_TEXT = 'font-semibold text-date-600 dark:text-date-400'

/** タイムラインの列の背景 */
export const TODAY_COLUMN = 'bg-date-50/40 dark:bg-date-500/5'
export const SELECTED_COLUMN = 'ring-1 ring-inset ring-date-400/50'
