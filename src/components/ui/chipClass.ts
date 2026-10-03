/**
 * チップの見た目（形はどこでもピル）。役割で 3 種類に分ける。
 * - fill: 見るだけのもの（To-Do 行のタグ・絞り込み・タイマーのタグ）。藍の薄い塗り
 * - outline: 押して選ぶもの（記録のラベル・最近の記録）。細い枠。選んでいるときは `selected` で色の塗り（`gc-solid`）
 * - add: 足すもの（＋）。点線の枠
 *
 * 押すと何か起きる fill（タグで絞る・絞り込みを外す）は `hover` を付ける。
 */
export type ChipVariant = 'fill' | 'outline' | 'add'
export type ChipSize = 'xs' | 'sm' | 'md'

const BASE = 'inline-flex items-center gap-1 rounded-full transition-colors touch-manipulation'

const SIZE: Record<ChipSize, string> = {
  xs: 'px-1.5 py-0.5 text-[10px]',
  sm: 'px-2 py-0.5 text-[11px]',
  md: 'px-2.5 py-1 text-xs',
}

const FILL = 'bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300'
const FILL_HOVER = 'hover:bg-accent-100 dark:hover:bg-accent-500/25'
const OUTLINE = 'border border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
const SELECTED = 'gc-solid border border-transparent font-medium'
const ADD =
  'border border-dashed border-zinc-300 text-zinc-400 hover:border-accent-400 hover:text-accent-600 dark:border-zinc-600 dark:text-zinc-500 dark:hover:text-accent-400'

export function chipClass(
  { variant, size = 'xs', hover = false, selected = false }: { variant: ChipVariant; size?: ChipSize; hover?: boolean; selected?: boolean },
  extra = '',
): string {
  const look =
    variant === 'fill' ? `${FILL} ${hover ? FILL_HOVER : ''}` : variant === 'add' ? ADD : selected ? SELECTED : OUTLINE
  return `${BASE} ${SIZE[size]} ${look} ${extra}`.replace(/\s+/g, ' ').trim()
}
