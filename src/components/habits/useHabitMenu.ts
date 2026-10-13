import { useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { useLongPress } from '../../hooks/useLongPress'

/** 押した所が日のマス（`data-habit-day="yyyy-MM-dd"`）なら、その日 */
function dayOf(target: EventTarget | null): string | null {
  return target instanceof Element ? (target.closest('[data-habit-day]')?.getAttribute('data-habit-day') ?? null) : null
}

/**
 * 習慣のカード・アーカイブの行のメニュー。右クリック（タッチは長押し）で開く。To-Do の行・ナビのリストと同じ ActionMenu。
 * `menuProps(habitId)` を開く元の要素に付ける。日のマス（`data-habit-day`）の上で開いたら、その日のメニュー（`dateKey`）
 */
export function useHabitMenu() {
  const [habitMenu, setHabitMenu] = useState<{ x: number; y: number; habitId: string; dateKey: string | null } | null>(null)
  const pressed = useRef<{ habitId: string; dateKey: string | null } | null>(null)
  const longPress = useLongPress((e) => {
    if (pressed.current) setHabitMenu({ x: e.clientX, y: e.clientY, ...pressed.current })
  })
  const menuProps = (habitId: string) => ({
    ...longPress.pointerHandlers,
    onPointerDown: (e: PointerEvent) => {
      pressed.current = { habitId, dateKey: dayOf(e.target) }
      longPress.pointerHandlers.onPointerDown(e)
    },
    onClickCapture: longPress.onClickCapture,
    onContextMenu: (e: MouseEvent) => {
      e.preventDefault()
      // 長押しで出る OS のメニューは抑え、長押しのほうで開く
      if (longPress.isPressing()) return
      setHabitMenu({ x: e.clientX, y: e.clientY, habitId, dateKey: dayOf(e.target) })
    },
    style: { WebkitTouchCallout: 'none' } as const,
  })
  return { habitMenu, closeHabitMenu: () => setHabitMenu(null), menuProps }
}

export type HabitMenuProps = ReturnType<ReturnType<typeof useHabitMenu>['menuProps']>
