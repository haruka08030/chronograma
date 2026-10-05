import type { MouseEvent } from 'react'
import { CheckIcon } from '../icons'
import { PRIORITY_RING_CLASS } from '../../lib/priorityColor'
import type { Priority } from '../../types/task'

/** 完了の印の形。To-Do は丸、チェックリスト（買い物）は四角、いつか（Wish）は ☆（かなえたら ★） */
export type CompletionShape = 'circle' | 'square' | 'star'

/**
 * タスクの完了の丸（To-Do 一覧・今日の計画で共通）。
 * - 見た目は 20px（サブタスクは 16px）、枠 1.5px。優先度があれば枠をその色に、完了は墨の塗り＋✓
 * - 押せる範囲は周りを広げて 40px（負のマージンで行の高さは変えない）
 * - `justCompleted`: 押した直後（完了の欄へ移る前）。✓ を小さく出して、押せたことを見せる
 * - `inert`: 複数選択中。押せない薄い印にして、押したら行の選ぶ・外すになる（選ぶ枠のすぐ隣で完了になる事故を防ぐ）
 */
export function CompletionCircle({
  completed,
  priority,
  small = false,
  shape = 'circle',
  label,
  onClick,
  inert = false,
  justCompleted = false,
}: {
  completed: boolean
  priority?: Priority
  /** サブタスク */
  small?: boolean
  shape?: CompletionShape
  label: string
  onClick: (e: MouseEvent<HTMLButtonElement>) => void
  inert?: boolean
  justCompleted?: boolean
}) {
  const inertClass = inert ? 'pointer-events-none opacity-40' : ''
  const ring = priority ? PRIORITY_RING_CLASS[priority] : undefined
  if (shape === 'star') {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        tabIndex={inert ? -1 : undefined}
        className={`flex-shrink-0 touch-manipulation ${inertClass} ${small ? '-m-2 p-2' : '-m-2.5 p-2.5'}`}
      >
        <span
          aria-hidden
          className={`flex items-center justify-center leading-none transition-colors ${small ? 'h-4 w-4 text-sm' : 'h-5 w-5 text-base'} ${
            completed
              ? 'text-amber-500 hover:text-zinc-300 dark:text-amber-400 dark:hover:text-zinc-600'
              : 'text-zinc-300 hover:text-amber-500 dark:text-zinc-600 dark:hover:text-amber-400'
          }`}
        >
          {completed ? '★' : '☆'}
        </span>
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      tabIndex={inert ? -1 : undefined}
      className={`group/check flex-shrink-0 touch-manipulation ${inertClass} ${small ? '-m-2 p-2' : '-m-2.5 p-2.5'}`}
    >
      <span
        className={`flex items-center justify-center ${shape === 'square' ? 'rounded-[5px]' : 'rounded-full'} border-[1.5px] transition-colors ${small ? 'h-4 w-4' : 'h-5 w-5'} ${
          completed
            ? 'border-accent-500 bg-accent-500 text-on-accent'
            : ring
              ? `border-current ${ring}`
              : 'border-zinc-300 group-hover/check:border-accent-500 dark:border-zinc-600'
        }`}
      >
        {completed && (
          <CheckIcon className={`${small ? 'h-2.5 w-2.5' : 'h-3 w-3'} ${justCompleted ? 'animate-check-in' : ''}`} strokeWidth={3} />
        )}
      </span>
    </button>
  )
}
