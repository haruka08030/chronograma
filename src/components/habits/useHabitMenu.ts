import { useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { useLongPress } from '../../hooks/useLongPress'

/**
 * 習慣のカード・アーカイブの行のメニュー。右クリック（タッチは長押し）で開く。To-Do の行・ナビのリストと同じ ActionMenu。
 * `menuProps(habitId)` を開く元の要素に付ける
 */
export function useHabitMenu() {
  const [habitMenu, setHabitMenu] = useState<{ x: number; y: number; habitId: string } | null>(null)
  const pressedHabitId = useRef<string | null>(null)
  const longPress = useLongPress((e) => {
    if (pressedHabitId.current) setHabitMenu({ x: e.clientX, y: e.clientY, habitId: pressedHabitId.current })
  })
  const menuProps = (habitId: string) => ({
    ...longPress.pointerHandlers,
    onPointerDown: (e: PointerEvent) => {
      pressedHabitId.current = habitId
      longPress.pointerHandlers.onPointerDown(e)
    },
    onClickCapture: longPress.onClickCapture,
    onContextMenu: (e: MouseEvent) => {
      e.preventDefault()
      // 長押しで出る OS のメニューは抑え、長押しのほうで開く
      if (longPress.isPressing()) return
      setHabitMenu({ x: e.clientX, y: e.clientY, habitId })
    },
    style: { WebkitTouchCallout: 'none' } as const,
  })
  return { habitMenu, closeHabitMenu: () => setHabitMenu(null), menuProps }
}

export type HabitMenuProps = ReturnType<ReturnType<typeof useHabitMenu>['menuProps']>
