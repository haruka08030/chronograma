import type { ReactNode } from 'react'
import { CheckIcon } from '../icons'
import { MENU_ROW_ACTIVE, MENU_ROW_HOVER } from './surface'

/**
 * メニューの行（タスクの右クリックメニュー・並べ替えなど、浮く面に縦に並べる項目）。どのメニューも同じ見た目にする。
 * - 左にアイコン（なくても字の位置はそろう）、右端に日付などの補足・ショートカット・チェック・中のメニューの ›
 * - `active` は ↑↓ やマウスで選んでいる行（ホバーの色を自分で持つのは、キー操作と同じ見た目にするため）
 * - 取り消せない・重い操作は `danger`（赤）
 */
export function MenuItem({
  icon,
  children,
  hint,
  keys,
  checked,
  danger = false,
  active = false,
  trailing,
  role = 'menuitem',
  onClick,
  onMouseEnter,
  ...rest
}: {
  icon?: ReactNode
  children: ReactNode
  /** 右端の補足（日付など） */
  hint?: string
  /** 右端のショートカット。キーボードのある PC だけ出す */
  keys?: string
  checked?: boolean
  danger?: boolean
  active?: boolean
  /** 右端に足すもの（中のメニューの › など） */
  trailing?: ReactNode
  role?: 'menuitem' | 'menuitemradio' | 'menuitemcheckbox'
  onClick?: () => void
  onMouseEnter?: () => void
  'data-sub'?: string
  'aria-haspopup'?: 'menu'
  'aria-expanded'?: boolean
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={role === 'menuitem' ? undefined : Boolean(checked)}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
        active ? MENU_ROW_ACTIVE : MENU_ROW_HOVER
      } ${danger ? 'text-red-600 dark:text-red-400' : 'text-zinc-700 dark:text-zinc-200'}`}
      {...rest}
    >
      <span className={`flex w-4 flex-shrink-0 justify-center ${danger ? '' : 'text-zinc-500 dark:text-zinc-400'}`}>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <span className="flex-shrink-0 text-xs text-zinc-400 dark:text-zinc-500">{hint}</span>}
      {keys && <span className="hidden flex-shrink-0 text-xs text-zinc-400 dark:text-zinc-500 [@media(hover:hover)]:inline">{keys}</span>}
      {checked && <CheckIcon className="h-3.5 w-3.5 flex-shrink-0 text-zinc-500 dark:text-zinc-300" strokeWidth={2.5} />}
      {trailing}
    </button>
  )
}

/** メニューの区切り線 */
export function MenuDivider() {
  return <div className="mx-1 my-1 border-t border-zinc-100 dark:border-zinc-700" />
}

/** メニューの小見出し（「2 件のタスク」など） */
export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="truncate px-2 pb-0.5 pt-1.5 text-[11px] font-medium text-zinc-400 dark:text-zinc-500">{children}</div>
}
