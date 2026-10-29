import type { Task } from '../types/task'
import { isCountedLog } from './vagueLog'
import { logSegmentClockOnDay } from './taskTimeRange'
import { timeToMinutes } from './clockTime'

/**
 * その日の記録をラベルごとに分ける。重なった時間は 2 回数えず、あとから始まった記録に入れる
 * （セミナーの途中の「移動」など、細かく付けたほうを残す）。睡眠は入れない（上の「睡眠」の行で見る）。「なんとなく」も入れない（#657）
 */
export function minutesByRecordLabel(
  logs: readonly Task[],
  dateKey: string,
  labelOf: (log: Task) => string,
): { totalMinutes: number; byCategory: [string, number][] } {
  const spans = logs
    .filter((log) => isCountedLog(log))
    .flatMap((log) => {
      const seg = logSegmentClockOnDay(log, dateKey)
      return seg ? [{ start: timeToMinutes(seg.startTime), end: timeToMinutes(seg.endTime), label: labelOf(log) }] : []
    })
    .sort((a, b) => a.start - b.start)
  const owner: (string | undefined)[] = new Array(24 * 60)
  for (const sp of spans) for (let m = sp.start; m < sp.end && m < owner.length; m++) owner[m] = sp.label
  const m = new Map<string, number>()
  let total = 0
  for (const label of owner) {
    if (label === undefined) continue
    total += 1
    m.set(label, (m.get(label) ?? 0) + 1)
  }
  return { totalMinutes: total, byCategory: [...m.entries()].sort((a, b) => b[1] - a[1]) }
}
