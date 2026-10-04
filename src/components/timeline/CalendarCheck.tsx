import { CheckIcon } from '../icons'
import { tip } from '../../lib/tooltip'

/**
 * カレンダー上の予定に付ける丸い ✓（月のマス・終日の行・時間ブロックで共有）。
 * 色はチップの文字色（`currentColor`）。完了済みは塗りつぶし、押すと戻せる。
 * チップ・ブロックのクリック（詳細を開く）やドラッグには伝えない。
 * チップの中（sm）はタッチでは押せない印にする: 小さすぎて、チップのどこをタップしても吸い寄せられて完了になる。
 * タッチではチップを押してカードを開き、そこから完了にする。
 */
export function CalendarCheck({ done = false, size = 'sm', label, onCheck, className = '' }: {
  done?: boolean
  /** sm: 月・終日のチップの中、md: 時間ブロックの右上 */
  size?: 'sm' | 'md'
  label: string
  onCheck: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      draggable={false}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onDragStart={(e) => { e.preventDefault(); e.stopPropagation() }}
      onClick={(e) => {
        e.stopPropagation()
        onCheck()
      }}
      onKeyDown={(e) => e.stopPropagation()}
      {...tip(label)}
      aria-label={label}
      aria-pressed={done}
      className={`flex ${size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5 pointer-coarse:pointer-events-none'} shrink-0 cursor-pointer items-center justify-center rounded-full border border-current transition-opacity
        ${done ? 'bg-current' : 'bg-white/70 opacity-70 hover:opacity-100 dark:bg-zinc-900/60'} ${className}`}
    >
      <CheckIcon className={`${size === 'md' ? 'h-2.5 w-2.5' : 'h-2 w-2'} ${done ? 'text-white dark:text-zinc-900' : ''}`} strokeWidth={3} />
    </button>
  )
}
