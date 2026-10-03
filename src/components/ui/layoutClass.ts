/**
 * 画面の中身をスクロールさせる枠（To-Do・ゴミ箱・カレンダー・検索・統計・習慣・設定）。
 * min-h-0 / min-w-0 が無いと、中身が長いときに親の flex ごと伸びてスクロールしなくなる。縦に並べる画面は flex-col を足す
 */
export const PAGE_SCROLL_CLASS = 'min-h-0 min-w-0 flex-1 overflow-y-auto'
