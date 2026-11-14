/**
 * いちばん多く出てくるもの（`key` が同じものを同じと数える）。同じ数なら先に出てくるもの。空なら undefined。
 * 「どの曜日も同じ時間にする」で 1 つに戻すときの時刻（睡眠の予定・習慣の曜日ごとの時間）
 */
export function mostCommon<T>(items: readonly T[], key: (item: T) => string): T | undefined {
  const counts = new Map<string, number>()
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1)
  let best: T | undefined
  let bestCount = 0
  for (const item of items) {
    const count = counts.get(key(item))!
    if (count > bestCount) {
      best = item
      bestCount = count
    }
  }
  return best
}
