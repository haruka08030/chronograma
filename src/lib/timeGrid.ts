import i18n from '../i18n/config'

export const HOUR_HEIGHT = 60
export const HOURS = Array.from({ length: 24 }, (_, i) => i)
export const SNAP_MINUTES = 15

export function timeToY(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return (h + m / 60) * HOUR_HEIGHT
}

export function yToTime(y: number): string {
  const totalMinutes = (y / HOUR_HEIGHT) * 60
  const snapped = Math.round(totalMinutes / SNAP_MINUTES) * SNAP_MINUTES
  const clamped = Math.max(0, Math.min(snapped, 24 * 60 - SNAP_MINUTES))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function formatTimeLabel(hour: number): string {
  return `${hour}:00`
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** 分単位の長さを日本語表示（例: 1時間15分） */
/** 分を「1時間15分」/「1h 15m」のように表示の言語で書く */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return i18n.t('planner.minutes', { m })
  if (m === 0) return i18n.t('planner.hours', { h })
  return i18n.t('planner.hoursMinutes', { h, m })
}

