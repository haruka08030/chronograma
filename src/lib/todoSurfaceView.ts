const TODO_SURFACE_VIEWS = new Set(['all', 'today', 'upcoming', 'overdue'])

export function isTodoSurfaceView(selectedView: string | null | undefined): boolean {
  return selectedView == null || TODO_SURFACE_VIEWS.has(selectedView)
}
