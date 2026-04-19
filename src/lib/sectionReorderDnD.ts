/** セクション見出しの並べ替え（ドラッグ元） */
export const DRAGSEC_PREFIX = 'dragsec::'
/** セクション見出しへのドロップ先 */
export const DROPSEC_PREFIX = 'dropsec::'

export function sectionDragHandleId(listId: string, sectionId: string): string {
  return `${DRAGSEC_PREFIX}${listId}::${sectionId}`
}

export function sectionDropHeaderId(listId: string, sectionId: string): string {
  return `${DROPSEC_PREFIX}${listId}::${sectionId}`
}

export function parseSectionReorderId(
  id: string,
  prefix: typeof DRAGSEC_PREFIX | typeof DROPSEC_PREFIX,
): { listId: string; sectionId: string } | null {
  if (!id.startsWith(prefix)) return null
  const rest = id.slice(prefix.length)
  const sep = rest.indexOf('::')
  if (sep < 0) return null
  const listId = rest.slice(0, sep)
  const sectionId = rest.slice(sep + 2)
  if (!listId || !sectionId) return null
  return { listId, sectionId }
}
