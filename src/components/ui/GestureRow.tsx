import { useRef, type HTMLAttributes, type ReactNode } from 'react'
import { useRowSwipe, type RowSwipeAction } from '../../hooks/useRowSwipe'
import { useLongPress } from '../../hooks/useLongPress'

/**
 * タッチの操作を付けた行（今日の計画）。横に払う（`useRowSwipe`）と長押し（`onLongPress`、選択を始める）。
 * 外の `li` が下地（払ったときに見える操作）を持ち、中の行が指に合わせて動く。
 * To-Do の行（TaskItem）は同じ hook を自分で使う
 */
export function GestureRow({
  right,
  left,
  onLongPress,
  enabled = true,
  className = '',
  rowProps,
  children,
}: {
  right?: RowSwipeAction
  left?: RowSwipeAction
  onLongPress?: (e: React.PointerEvent) => void
  enabled?: boolean
  className?: string
  rowProps?: HTMLAttributes<HTMLDivElement> & Record<`data-${string}`, string>
  children: ReactNode
}) {
  const rowRef = useRef<HTMLDivElement>(null)
  const swipe = useRowSwipe(rowRef, { right, left }, enabled)
  const longPress = useLongPress((e) => onLongPress?.(e), enabled && !!onLongPress)
  return (
    <li className="relative rounded-lg">
      {swipe.backdrop}
      <div
        ref={rowRef}
        {...rowProps}
        {...longPress.pointerHandlers}
        style={{ WebkitTouchCallout: 'none' }}
        className={`relative ${className} ${swipe.swipingClass}`}
        onContextMenu={(e) => {
          // 長押しで出る OS のメニューを抑える（選択に使う）
          if (longPress.isPressing()) {
            e.preventDefault()
            return
          }
          rowProps?.onContextMenu?.(e)
        }}
        onClickCapture={(e) => {
          swipe.onClickCapture(e)
          longPress.onClickCapture(e)
        }}
      >
        {children}
      </div>
    </li>
  )
}
