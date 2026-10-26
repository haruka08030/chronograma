/**
 * 取り込み（Notion・フォルダを畳んだラベル）で作ったラベルの名前を覚える（`labelSync.ts` の同期で、合わせた表に無ければ足して送る）。
 * ストアが取り込みのたびに読むので、同期のファイルとは分ける（同期はログインしてから読む）
 */

/** 取り込みで表を変えたあとの覚えておく名前（前から覚えている名前と、新しく足した名前） */
export function pendingAddsAfterImport(pending: readonly string[], before: readonly string[], after: readonly string[]): string[] {
  const added = after.filter((n) => !before.includes(n) && !pending.includes(n))
  return added.length === 0 ? [...pending] : [...pending, ...added]
}
