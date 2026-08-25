const TODO_SURFACE_VIEWS = new Set(['all', 'today', 'upcoming', 'overdue'])

/** 検索ヘッダーを出す To‑Do 本体ビュー（リスト選択 = null を含む） */
export function isTodoSurfaceView(selectedView: string | null | undefined): boolean {
  return selectedView == null || TODO_SURFACE_VIEWS.has(selectedView)
}

/** To‑Do の細いサブナビ（期限別ビュー / リスト / アーカイブ・ゴミ箱）を出すビュー */
export function isTodoNavView(selectedView: string | null | undefined): boolean {
  return (
    isTodoSurfaceView(selectedView) ||
    selectedView === 'archived' ||
    selectedView === 'deleted'
  )
}
