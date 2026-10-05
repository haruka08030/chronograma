import type { ReactNode } from 'react'
import { buttonClass } from './buttonClass'
import { tip } from '../../lib/tooltip'
import { REVEAL_ON_ROW_HOVER } from './revealClass'

/**
 * 行の右端に置くアイコンだけの操作（今日の計画の「記録を開始」「今日やる」など）。
 * 押すと実行するボタンなので角丸の四角・枠あり（`buttonClass` の secondary）。名前はホバーで出す。
 * `revealOnHover` はマウスで行に乗せたときだけ出す（タッチでは常に出す）。指で押す画面では一回り大きくする。
 * `mouseOnly` はタッチの画面では出さない（スマホは行のスワイプなど別の操作で同じことができるもの）
 */
export function RowActionButton({
  label,
  onClick,
  revealOnHover = false,
  mouseOnly = false,
  children,
}: {
  label: string
  onClick: () => void
  revealOnHover?: boolean
  mouseOnly?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...tip(label, { name: true })}
      className={buttonClass(
        { variant: 'secondary', size: 'xs' },
        `h-7 w-7 shrink-0 px-0! py-0! text-zinc-500 pointer-coarse:h-9 pointer-coarse:w-9 dark:text-zinc-400 ${
          revealOnHover ? REVEAL_ON_ROW_HOVER : ''
        } ${mouseOnly ? 'pointer-coarse:hidden' : ''}`,
      )}
    >
      {children}
    </button>
  )
}
