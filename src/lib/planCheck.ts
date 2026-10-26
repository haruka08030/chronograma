import { minutesToTime, timeToMinutes } from './clockTime'

/**
 * タイムラインの予定の ✓（「終わった」、#638）で作る記録の時間。
 * 予定の途中で押したら今で終える（予定の開始〜今）。終わった後・過ぎた日は予定どおり。
 * `limitMin` は記録を置ける最後の分（過ぎた日は null、`logLimitAt`）。終わりの 24:00 は 0:00 終わりにする
 */
export function checkRecordTimes(
  seg: { startTime: string; endTime: string },
  limitMin: number | null,
): { startTime: string; endTime: string } {
  const start = timeToMinutes(seg.startTime)
  const end = seg.endTime === '24:00' ? 24 * 60 : timeToMinutes(seg.endTime)
  const until = limitMin !== null && limitMin > start && limitMin < end ? limitMin : end
  return { startTime: seg.startTime, endTime: until === 24 * 60 ? '00:00' : minutesToTime(until) }
}

/**
 * 予定（アプリの予定・Google の予定）を記録にしたもの: その日の、同じ題名で予定の時間に重なる記録。
 * あれば ✓ 済み（もう一度押すとこれを外す）
 */
export function planRecordOn<T extends { title: string; startTime?: string | null; endTime?: string | null }>(
  dayLogs: readonly T[],
  title: string,
  seg: { startTime: string; endTime: string },
): T | undefined {
  const start = timeToMinutes(seg.startTime)
  const end = seg.endTime === '24:00' || seg.endTime === '00:00' ? 24 * 60 : timeToMinutes(seg.endTime)
  return dayLogs.find((l) => {
    if (l.title !== title || !l.startTime || !l.endTime) return false
    const ls = timeToMinutes(l.startTime)
    const le = l.endTime === '00:00' || timeToMinutes(l.endTime) <= ls ? 24 * 60 : timeToMinutes(l.endTime)
    return ls < end && le > start
  })
}
