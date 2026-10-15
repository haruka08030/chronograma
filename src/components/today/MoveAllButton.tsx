import type { ReactNode } from 'react'
import { buttonClass } from '../ui/buttonClass'
import { CalendarDoubleArrowIcon } from '../icons'

/**
 * 何件かをまとめてこの日へ移すボタン（やり残しの「すべて今日へ」・締切が近い To-Do の「この N 件を今日やる」）。
 * 一覧が組み変わる操作なので、行・見出しの文字と見分けがつくよう枠と » の印を付け、文字でも何をするか出す
 */
export function MoveAllButton({ onClick, children, className = '' }: { onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={buttonClass(
        { variant: 'secondary', size: 'xs' },
        `shrink-0 text-zinc-600 pointer-coarse:min-h-9 dark:text-zinc-300 ${className}`,
      )}
    >
      <CalendarDoubleArrowIcon className="h-3.5 w-3.5" />
      {children}
    </button>
  )
}
