/**
 * 「最後の同期」の相対表記に使う翻訳キーと件数。
 * 時計のずれや壊れた値で負の数を出さないよう、1 分未満はすべて「たった今」に寄せる。
 */
export function relativeSyncKey(iso: string, now: number): { key: string; count: number } {
  const diffMin = Math.floor((now - Date.parse(iso)) / 60_000)
  if (!Number.isFinite(diffMin) || diffMin < 1) return { key: 'sync.justNow', count: 0 }
  if (diffMin < 60) return { key: 'sync.minutesAgo', count: diffMin }
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return { key: 'sync.hoursAgo', count: diffHour }
  return { key: 'sync.daysAgo', count: Math.floor(diffHour / 24) }
}
