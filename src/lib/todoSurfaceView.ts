import type { SectionGrouping, SectionGroupingScope, SortMode } from '../store/storeTypes'

const TODO_SURFACE_VIEWS = new Set(['all', 'today', 'upcoming', 'overdue'])

/** 検索ヘッダーを出す To‑Do 本体ビュー（リスト選択 = null を含む） */
export function isTodoSurfaceView(selectedView: string | null | undefined): boolean {
  return selectedView == null || TODO_SURFACE_VIEWS.has(selectedView)
}

/** To‑Do の細いサブナビ（期限別ビュー / リスト / 完了済み・アーカイブ・ゴミ箱）を出すビュー */
export function isTodoNavView(selectedView: string | null | undefined): boolean {
  return (
    isTodoSurfaceView(selectedView) ||
    selectedView === 'completed' ||
    selectedView === 'archived' ||
    selectedView === 'deleted'
  )
}

/** 並び順を覚える鍵。リストを開いているならそのリスト、ビューなら `view:<ビュー>` */
export function sortKeyOf(selectedListId: string | null, selectedView: string | null): string {
  return selectedListId ?? `view:${selectedView ?? 'all'}`
}

/** そのリスト・ビューの並び順。選んだことが無ければ手動 */
export function sortModeOf(sortByKey: Record<string, SortMode> | undefined, key: string): SortMode {
  return sortByKey?.[key] ?? 'manual'
}

/** セクションの塊で分けるか。手動はセクションの中で並べ替えるので常に分ける。サイドバーのセクション行もこれに合わせる */
export function groupsBySection(
  sortMode: SortMode,
  sectionGrouping: SectionGrouping,
  scope: SectionGroupingScope,
): boolean {
  if (sortMode === 'manual') return true
  if (typeof scope === 'object') return sectionGrouping.byList?.[scope.listId] ?? true
  return sectionGrouping[scope]
}
