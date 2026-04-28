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

/** `startTime`〜`endTime` の差（分）。どちらか欠けるときは `null` */
export function durationMinutesForTaskSlot(task: {
  startTime?: string | null
  endTime?: string | null
}): number | null {
  const { startTime, endTime } = task
  if (!startTime || !endTime) return null
  return timeToMinutes(endTime) - timeToMinutes(startTime)
}

export function durationMinutesForTaskId<T extends { id: string; startTime?: string | null; endTime?: string | null }>(
  tasks: T[],
  taskId: string,
): number | null {
  const t = tasks.find((x) => x.id === taskId)
  return t ? durationMinutesForTaskSlot(t) : null
}

/** 分単位の長さを日本語表示（例: 1時間15分） */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `${h}時間${m}分`
  if (h > 0) return `${h}時間`
  return `${m}分`
}

