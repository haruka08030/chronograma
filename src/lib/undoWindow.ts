/**
 * 「元に戻す」のトーストを出しておく時間。Google の予定の削除は、この間だけ Google に送るのを待つ
 * （トーストが消えたあとは戻せないので、両方を同じ長さにそろえる）
 */
export const UNDO_WINDOW_MS = 5000

/** トーストに入れるタイトルは短く切る（「…を削除しました」「元に戻す」まで読めるように） */
const TOAST_TITLE_MAX = 14
export function toastTitle(title: string): string {
  const s = title.trim()
  return s.length > TOAST_TITLE_MAX ? `${s.slice(0, TOAST_TITLE_MAX)}…` : s
}
