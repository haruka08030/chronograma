import i18n from '../i18n/config'
import { minutesToTime } from './clockTime'

export { timeToMinutes } from './clockTime'

/** 1 時間の高さ（px）の既定と、ピンチで変えられる幅 */
export const DEFAULT_HOUR_HEIGHT = 60
export const MIN_HOUR_HEIGHT = 30
export const MAX_HOUR_HEIGHT = 180
const HOUR_HEIGHT_KEY = 'chronograma_hour_height'

function readHourHeight(): number {
  try {
    const v = Number(globalThis.localStorage?.getItem(HOUR_HEIGHT_KEY))
    return v >= MIN_HOUR_HEIGHT && v <= MAX_HOUR_HEIGHT ? v : DEFAULT_HOUR_HEIGHT
  } catch {
    return DEFAULT_HOUR_HEIGHT
  }
}

/**
 * 1 時間の高さ（px）。タイムラインのピンチで変わり、端末に残す（同期はしない）。
 * 読むたびに今の値になる（ES モジュールの live binding）。描くところは `useHourHeight()` で変わったら描き直す
 */
export let HOUR_HEIGHT = readHourHeight()
const hourHeightListeners = new Set<() => void>()

export function setHourHeight(px: number) {
  const next = Math.round(Math.min(MAX_HOUR_HEIGHT, Math.max(MIN_HOUR_HEIGHT, px)))
  if (next === HOUR_HEIGHT) return
  HOUR_HEIGHT = next
  try {
    globalThis.localStorage?.setItem(HOUR_HEIGHT_KEY, String(next))
  } catch {
    /* 保存できなくても今の画面では効く */
  }
  for (const l of hourHeightListeners) l()
}

export function subscribeHourHeight(listener: () => void): () => void {
  hourHeightListeners.add(listener)
  return () => hourHeightListeners.delete(listener)
}
export const HOURS = Array.from({ length: 24 }, (_, i) => i)
/** 1 日表示で 24 時の下に続けて出す次の日の夜中の時間（日をまたぐ予定・記録のため） */
export const NIGHT_HOURS = 4
export const SNAP_MINUTES = 15

export function timeToY(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return (h + m / 60) * HOUR_HEIGHT
}

export function yToTime(y: number): string {
  const totalMinutes = (y / HOUR_HEIGHT) * 60
  const snapped = Math.round(totalMinutes / SNAP_MINUTES) * SNAP_MINUTES
  const clamped = Math.max(0, Math.min(snapped, 24 * 60 - SNAP_MINUTES))
  return minutesToTime(clamped)
}

export function formatTimeLabel(hour: number): string {
  return `${hour}:00`
}

/** 分を「1時間15分」/「1h 15m」のように表示の言語で書く */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return i18n.t('planner.minutes', { m })
  if (m === 0) return i18n.t('planner.hours', { h })
  return i18n.t('planner.hoursMinutes', { h, m })
}

/** 狭いところ（月のマス）用の短い長さ。言語によらず「3h20」「2h」「45m」 */
export function formatDurationShort(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h${m ? String(m).padStart(2, '0') : ''}` : `${m}m`
}
