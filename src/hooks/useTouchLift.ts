import { useSyncExternalStore } from 'react'
import { getLiftState, isLiftActive, startLift, subscribeLift } from '../lib/touchLift'
import { useLongPress } from './useLongPress'

/** いま浮いている行（タッチの長押し）。無ければ null */
export function useLiftedRowId(): string | null {
  return useSyncExternalStore(subscribeLift, () => getLiftState().rowId)
}

/** 浮かせて押さえたまま、まだ動かしていない（運ぶときだけ出すもの — 置き場の帯・計測の帯 — を出さない） */
export function useLiftHeld(): boolean {
  return useSyncExternalStore(subscribeLift, () => getLiftState().rowId !== null && !getLiftState().moving)
}

/** 浮いている束の件数（To-Do 一覧が数える）。数えていなければ null */
export function useLiftGroupCount(): number | null {
  return useSyncExternalStore(subscribeLift, () => getLiftState().groupCount)
}

/**
 * ドラッグで運ばない行（今日の計画・並べ替えのない To-Do など）の長押し。浮かせて選択に入れ、押さえている間は別の指のタップで足せる。
 * 手動の並びの To-Do の行は、同じことを dnd-kit のセンサー（`appTouchSensor`）がして、そのまま運べる。
 * `useLongPress` の `pointerHandlers` / `onClickCapture` / `isPressing` と、この行が浮いている間 true の `lifted`（`enabled` のときだけ）を返す
 */
export function useRowLift(rowId: string, enabled: boolean) {
  const longPress = useLongPress(() => {
    // 別の行を押さえている間に長く置いた指では浮かせ直さない
    if (!isLiftActive()) startLift(rowId)
  }, enabled)
  const lifted = useSyncExternalStore(subscribeLift, () => getLiftState().rowId === rowId)
  return { ...longPress, lifted: enabled && lifted }
}
