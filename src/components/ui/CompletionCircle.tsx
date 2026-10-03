import type { MouseEvent } from 'react'
import { CheckIcon } from '../icons'
import { PRIORITY_RING_CLASS } from '../../lib/priorityColor'
import type { Priority } from '../../types/task'

/**
 * タスクの完了の丸（To-Do 一覧・今日の計画で共通）。
 * - 見た目は 20px（サブタスクは 16px）、枠 1.5px。優先度があれば枠をその色に、完了は墨の塗り＋✓
 * - 押せる範囲は周りを広げて 40px（負のマージンで行の高さは変えない）
 */
export function CompletionCircle({
  completed,
  priority,
  small = false,
  label,
  onClick,
}: {
  completed: boolean
  priority?: Priority
  /** サブタスク */
  small?: boolean
  label: string
  onClick: (e: MouseEvent<HTMLButtonElement>) => void
}) {
  const ring = priority ? PRIORITY_RING_CLASS[priority] : undefined
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`group/check flex-shrink-0 touch-manipulation ${small ? '-m-2 p-2' : '-m-2.5 p-2.5'}`}
    >
      <span
        className={`flex items-center justify-center rounded-full border-[1.5px] transition-colors ${small ? 'h-4 w-4' : 'h-5 w-5'} ${
          completed
            ? 'border-accent-500 bg-accent-500 text-on-accent'
            : ring
              ? `border-current ${ring}`
              : 'border-zinc-300 group-hover/check:border-accent-500 dark:border-zinc-600'
        }`}
      >
        {completed && <CheckIcon className={small ? 'h-2.5 w-2.5' : 'h-3 w-3'} strokeWidth={3} />}
      </span>
    </button>
  )
}
