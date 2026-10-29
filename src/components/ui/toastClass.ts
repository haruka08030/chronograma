/** 下のナビ（スマホ）の上。記録中は浮くタイマーの上へ一段ずらす（トースト・選択中のバーで同じ） */
export const FLOAT_BOTTOM = 'bottom-[calc(3.5rem+0.75rem+env(safe-area-inset-bottom))] md:bottom-6'
export const FLOAT_BOTTOM_ABOVE_TIMER = 'bottom-[calc(3.5rem+4.5rem+env(safe-area-inset-bottom))] md:bottom-24'

/** トーストの中のボタン（「元に戻す」など）。`muted` は 2 つ目の控えめな選び方 */
export function toastButtonClass(muted = false): string {
  return `shrink-0 font-semibold underline-offset-2 touch-manipulation hover:underline ${
    muted ? 'text-zinc-300 dark:text-zinc-600' : 'text-white dark:text-zinc-900'
  }`
}
