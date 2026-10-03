import { useSyncExternalStore } from 'react'

/**
 * カレンダー上の ToDo をつかんでいる間の共有状態。
 * 「ToDo に戻す」落とし先（下の ToDo 一覧 / 閉じているときの帯）を、ドラッグ中だけ出して光らせるために使う。
 */
interface CalendarItemDragState {
  active: boolean
  overUnschedule: boolean
  /** 時間の格子の上のブロックを動かしている（閉じた置き場の代わりの帯は出さない） */
  fromGrid: boolean
}

let state: CalendarItemDragState = { active: false, overUnschedule: false, fromGrid: false }
const subscribers = new Set<() => void>()

function patch(next: Partial<CalendarItemDragState>) {
  const merged = { ...state, ...next }
  if (merged.active === state.active && merged.overUnschedule === state.overUnschedule && merged.fromGrid === state.fromGrid) return
  state = merged
  subscribers.forEach((f) => f())
}

export function setCalendarItemDragActive(active: boolean, { fromGrid = false }: { fromGrid?: boolean } = {}) {
  patch(active ? { active, fromGrid } : { active, overUnschedule: false, fromGrid: false })
}

export function setUnscheduleHover(over: boolean) {
  patch({ overUnschedule: over })
}

export function getCalendarItemDrag(): CalendarItemDragState {
  return state
}

export function useCalendarItemDrag(): CalendarItemDragState {
  return useSyncExternalStore(
    (f) => {
      subscribers.add(f)
      return () => { subscribers.delete(f) }
    },
    () => state,
  )
}

/**
 * ネイティブ D&D でカレンダーの ToDo チップをつかんだとき（dragstart）に呼ぶ。
 * dragstart 中に DOM を変えるとドラッグが切れるので、落とし先は次のタスクで出す。
 * つかんだチップが週めくりで消えても終われるよう、window の drop / dragend で閉じる
 */
export function beginCalendarItemNativeDrag() {
  window.setTimeout(() => setCalendarItemDragActive(true), 0)
  const end = () => {
    window.removeEventListener('dragend', end)
    window.removeEventListener('drop', end)
    window.setTimeout(() => setCalendarItemDragActive(false), 0)
  }
  window.addEventListener('dragend', end)
  window.addEventListener('drop', end)
}

/** 「ToDo に戻す」落とし先に付ける属性（ポインタドラッグは座標からこれを探す） */
export const UNSCHEDULE_DROP_ATTR = 'data-unschedule-drop'

export function isOverUnscheduleDrop(clientX: number, clientY: number): boolean {
  return !!document.elementFromPoint(clientX, clientY)?.closest(`[${UNSCHEDULE_DROP_ATTR}]`)
}

/** 予定日と時刻をはずして「時間が未定」の ToDo に戻す。期限 dueDate は締切なので残す */
export const UNSCHEDULE_PATCH = { scheduledDate: null, startTime: null, endTime: null }
