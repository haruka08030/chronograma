/**
 * ボタンの見た目（アプリ全体で 1 種類）。形は角丸の四角（入力欄・カードと同じ形）。
 * ピルはチップ（最近の記録・ラベル・分類・切り替え）だけに使い、押すと実行するボタンと見分ける。
 * - primary: いちばん大事な操作（保存・追加・開始）。墨色の塗り
 * - secondary: 並べて出す別の操作（今日・後から記録）。枠だけ
 * - ghost: 取り消し・閉じるなど控えめな操作。地なし
 * - danger: 削除など戻せない／重い操作。赤い枠
 * - link: 文中や見出しの横に置く小さな操作（すべて追加・チェック済みを消す）
 *
 * `<button>` 以外（`<a>` など）にも使えるよう class 文字列を返す。
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link'
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg'

const BASE =
  'inline-flex items-center justify-center gap-1.5 font-medium transition-[color,background-color,border-color,scale] touch-manipulation active:scale-[0.97] disabled:cursor-not-allowed disabled:active:scale-100 disabled:opacity-40'

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent-600 text-on-accent hover:bg-accent-700',
  secondary:
    'border border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800',
  ghost: 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800',
  danger:
    'border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10',
  link: 'text-accent-600 hover:bg-accent-50 dark:text-accent-400 dark:hover:bg-accent-500/10',
}

const SIZE: Record<ButtonSize, string> = {
  xs: 'rounded-md px-2.5 py-1 text-xs',
  sm: 'rounded-lg px-3 py-1.5 text-xs',
  md: 'rounded-lg px-4 py-2 text-sm',
  /** 画面の主役の操作（今日の「記録する」など）。指で押しやすい 44px */
  lg: 'min-h-11 gap-2 rounded-lg px-4 text-sm',
}

export function buttonClass(
  { variant = 'secondary', size = 'sm' }: { variant?: ButtonVariant; size?: ButtonSize } = {},
  extra = '',
): string {
  return `${BASE} ${VARIANT[variant]} ${SIZE[size]}${extra ? ` ${extra}` : ''}`
}
