import { useRef, type HTMLAttributes, type ReactNode } from 'react'
import { useRowSwipe, type RowSwipeAction } from '../../hooks/useRowSwipe'
import { useRowLift } from '../../hooks/useTouchLift'
import { ROW_LIFTED_CLASS } from './rowStateClass'

/**
 * タッチの操作を付けた行（今日の計画）。横に払う（`useRowSwipe`）と長押し（`liftId` の行を浮かせて選択に入れる。
 * 押さえたまま別の指でタップした行も選択に足す。`useRowLift`）。
 * 外の `li` が下地（払ったときに見える操作）を持ち、中の行が指に合わせて動く。
 * To-Do の行（TaskItem）は同じ hook を自分で使う
 */
export function GestureRow({
  right,
  left,
  liftId,
  enabled = true,
  className = '',
  rowProps,
  itemRole,
  children,
}: {
  right?: RowSwipeAction
  left?: RowSwipeAction
  /** 長押しで浮かせる行の id（選択できる行だけ。渡さなければ長押しは何もしない。タッチだけ） */
  liftId?: string
  /** 横に払う操作を効かせるか */
  enabled?: boolean
  className?: string
  rowProps?: HTMLAttributes<HTMLDivElement> & Record<`data-${string}`, string>
  /** 外の `li` の役割。中の行が listbox の option のときは 'none'（list の項目にしない） */
  itemRole?: 'none'
  children: ReactNode
}) {
  const rowRef = useRef<HTMLDivElement>(null)
  const swipe = useRowSwipe(rowRef, { right, left }, enabled)
  // 浮かせるのは選択中も効かせる（`enabled` は払う操作だけ）
  const longPress = useRowLift(liftId ?? '', !!liftId)
  return (
    <li role={itemRole} className="relative rounded-lg">
      {swipe.backdrop}
      <div
        ref={rowRef}
        {...rowProps}
        {...longPress.pointerHandlers}
        style={{ WebkitTouchCallout: 'none' }}
        className={`relative ${className} ${longPress.lifted ? ROW_LIFTED_CLASS : ''} ${swipe.swipingClass}`}
        onContextMenu={(e) => {
          // 長押しで出る OS のメニューを抑える（行を浮かせるのに使う）
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
