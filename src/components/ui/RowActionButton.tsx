import type { ReactNode } from 'react'
import { buttonClass } from './buttonClass'
import { tip } from '../../lib/tooltip'

/**
 * 行の右端に置くアイコンだけの操作（今日の計画の「記録を開始」「今日やる」など）。
 * 押すと実行するボタンなので角丸の四角・枠あり（`buttonClass` の secondary）。名前はホバーで出す。
 * `revealOnHover` は PC で行に乗せたときだけ出す（スマホは常に出す）
 */
export function RowActionButton({
  label,
  onClick,
  revealOnHover = false,
  children,
}: {
  label: string
  onClick: () => void
  revealOnHover?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      {...tip(label)}
      className={buttonClass(
        { variant: 'secondary', size: 'xs' },
        `h-9 w-9 shrink-0 px-0! py-0! text-zinc-500 md:h-7 md:w-7 dark:text-zinc-400 ${
          revealOnHover ? 'md:opacity-0 md:focus-visible:opacity-100 md:group-hover/row:opacity-100' : ''
        }`,
      )}
    >
      {children}
    </button>
  )
}
