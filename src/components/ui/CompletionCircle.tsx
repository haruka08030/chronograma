import type { CSSProperties, MouseEvent } from 'react'
import { CheckIcon, StarFilledIcon, StarIcon } from '../icons'
import { PRIORITY_RING_CLASS } from '../../lib/priorityColor'
import { colorVars } from '../../lib/logCategoryColors'
import type { Priority } from '../../types/task'

/** 完了の印の形。To-Do は丸、チェックリスト（買い物）は四角、いつか（Wish）は ☆（かなえたら ★） */
/** かなえたの ★ の色（いつかの丸・夢のタイル・メニューで同じ） */
export const FULFILLED_TEXT = 'text-amber-500 dark:text-amber-400'

/** かなえたの印 ★。夢のタイルなど、押せない所に置く */
export function FulfilledMark({ className = 'h-4 w-4' }: { className?: string }) {
  return <StarFilledIcon className={`shrink-0 ${FULFILLED_TEXT} ${className}`} strokeWidth={1.5} />
}

/** まだの丸の灰色の輪（To-Do の丸。今日の画面の習慣のまだの丸も同じ、#510） */
export const COMPLETION_RING_IDLE = 'border-zinc-300 dark:border-zinc-600'

export type CompletionShape = 'circle' | 'square' | 'star'

/**
 * タスクの完了の丸（To-Do 一覧・今日の計画で共通）。
 * - 見た目は 20px（サブタスクは 16px）、枠 1.5px。優先度があれば枠をその色に、完了は墨の塗り＋✓
 * - 押せる範囲は周りを広げて 40px（負のマージンで行の高さは変えない）
 * - `justCompleted`: 押した直後（完了の欄へ移る前）。✓ を小さく出して、押せたことを見せる
 * - 読み上げ: チェックボックス（aria-checked = 完了）。`label` にはタスク名を入れる（「「牛乳を買う」を完了」）
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
        role="checkbox"
        aria-checked={completed}
        onClick={onClick}
        aria-label={label}
        tabIndex={inert ? -1 : undefined}
        className={`flex-shrink-0 touch-manipulation ${inertClass} ${small ? '-m-2 p-2' : '-m-2.5 p-2.5'}`}
      >
        <span
          aria-hidden
          className={`flex items-center justify-center transition-colors ${small ? 'h-4 w-4' : 'h-5 w-5'} ${
            completed
              ? `${FULFILLED_TEXT} hover:text-zinc-300 dark:hover:text-zinc-600`
              : 'text-zinc-300 hover:text-amber-500 dark:text-zinc-600 dark:hover:text-amber-400'
          }`}
        >
          {completed ? (
            <StarFilledIcon className={small ? 'h-3.5 w-3.5' : 'h-[18px] w-[18px]'} strokeWidth={1.5} />
          ) : (
            <StarIcon className={small ? 'h-3.5 w-3.5' : 'h-[18px] w-[18px]'} strokeWidth={1.5} />
          )}
        </span>
      </button>
    )
  }
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={completed}
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
              : `${COMPLETION_RING_IDLE} group-hover/check:border-accent-500`
        }`}
      >
        {completed && (
          <CheckIcon className={`${small ? 'h-2.5 w-2.5' : 'h-3 w-3'} ${justCompleted ? 'animate-check-in' : ''}`} strokeWidth={3} />
        )}
      </span>
    </button>
  )
}

/**
 * 完了の丸の代わりに置く、予定（完了の無いもの）の印。Google の予定の一覧と同じく色の丸だけを出す。
 * 大きさ・枠の太さは完了の丸と同じ（20px、サブタスクは 16px）。並べたときに丸の大きさがそろう
 * `hex` の代わりに `style` で `--c` を渡せる（睡眠の色など）
 */
export function EventMark({
  hex,
  style,
  small = false,
  dotClass = 'gc-dot',
}: {
  hex?: string
  style?: CSSProperties
  small?: boolean
  /** 丸の塗り方（ラベルなしのこれからの予定は縁だけの `gc-dot-none`、`planDotClass`） */
  dotClass?: string
}) {
  return (
    <span
      aria-hidden
      className={`${dotClass} flex-shrink-0 rounded-full border-[1.5px] ${small ? 'h-4 w-4' : 'h-5 w-5'}`}
      style={style ?? (hex ? colorVars(hex) : undefined)}
    />
  )
}
