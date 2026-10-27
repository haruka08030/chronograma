import { CheckIcon } from '../icons'
import { tip } from '../../lib/tooltip'

/**
 * カレンダー上の予定に付ける丸い ✓（月のマス・終日の行・時間ブロックで共有）。
 * 色はチップの文字色（`currentColor`）。完了済みは塗りつぶし、押すと戻せる。
 * まだの地は sRGB の白で書く（`bg-white/70` は oklab で作られ、白い枠の上に重ねると Chromium が水色に描く）。
 * チップ・ブロックのクリック（詳細を開く）やドラッグには伝えない。
 * チップの中（sm）はタッチでは押せない印にする: 小さすぎて、チップのどこをタップしても吸い寄せられて完了になる。
 * タッチではチップを押してカードを開き、そこから完了にする。
 */
export function CalendarCheck({
  done = false,
  size = 'sm',
  label,
  onCheck,
  className = '',
}: {
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
      onDragStart={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      onClick={(e) => {
        e.stopPropagation()
        onCheck()
      }}
      onKeyDown={(e) => e.stopPropagation()}
      {...tip(label, { name: true })}
      aria-pressed={done}
      className={`flex ${size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5 pointer-coarse:pointer-events-none'} shrink-0 cursor-pointer items-center justify-center rounded-full border border-current transition-opacity
        ${done ? 'bg-current' : 'bg-[rgb(255_255_255/0.7)] opacity-70 hover:opacity-100 dark:bg-zinc-900/60'} ${className}`}
    >
      <CheckIcon
        className={`${size === 'md' ? 'h-2.5 w-2.5' : 'h-2 w-2'} ${done ? 'text-white dark:text-zinc-900' : ''}`}
        strokeWidth={3}
      />
    </button>
  )
}

/**
 * 月・終日のチップで ✓ の代わりに置く予定（完了の無いもの）の印。`CalendarCheck` と同じ大きさの色の丸（色は親の `--c`。塗り方は `planDotClass`）
 */
export function CalendarDot({ size = 'sm', dotClass = 'gc-dot' }: { size?: 'sm' | 'md'; dotClass?: string }) {
  return <span aria-hidden className={`${dotClass} shrink-0 rounded-full ${size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5'}`} />
}
