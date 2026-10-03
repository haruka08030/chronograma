import type { ListSection } from '../types/section'

export type SectionGroup<T> = { section: ListSection | null; items: T[] }

/**
 * 1 つのリストの項目をセクションごとに分ける。セクションなし（消えたセクションのものも含む）が先頭、
 * 続いてセクションの並び順。空のセクションも残す（サイドバーで押したときに見出しへ飛べるように）
 */
export function groupBySection<T extends { sectionId: string | null }>(
  items: T[],
  sections: ListSection[],
  listId: string,
): SectionGroup<T>[] {
  const own = sections.filter((s) => s.listId === listId).sort((a, b) => a.order - b.order)
  const known = new Set(own.map((s) => s.id))
  return [
    { section: null, items: items.filter((x) => !x.sectionId || !known.has(x.sectionId)) },
    ...own.map((section) => ({ section, items: items.filter((x) => x.sectionId === section.id) })),
  ]
}
