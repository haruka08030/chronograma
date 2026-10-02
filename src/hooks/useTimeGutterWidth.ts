import { useTaskStore } from '../store/taskStore'

/** 時間バーのアプリのタイムゾーンの列の幅 */
export const GUTTER_PRIMARY_WIDTH = 56
/** 時間バーの他のタイムゾーン 1 つぶんの幅 */
export const GUTTER_EXTRA_WIDTH = 44

/** 時間バーの幅（他のタイムゾーンを並べるぶん広がる）。見出しの行の空きもこれに揃える */
export function useTimeGutterWidth(): number {
  const extra = useTaskStore((s) => s.extraTimeZones)
  return GUTTER_PRIMARY_WIDTH + extra.length * GUTTER_EXTRA_WIDTH
}
