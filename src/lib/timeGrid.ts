import i18n from '../i18n/config'
import { minutesToTime } from './clockTime'
import { DAY_START_HOUR } from './timeZone'

export { timeToMinutes } from './clockTime'

export const HOUR_HEIGHT = 60
export const HOURS = Array.from({ length: 24 }, (_, i) => i)
/** 1 日表示で 24 時の下に続けて出す次の日の時間（1 日の区切り `DAY_START_HOUR` まで） */
export const NIGHT_HOURS = DAY_START_HOUR
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
