/** ⌘（mac）または Ctrl（Windows/Linux）が押されているか */
export function isModKey(e: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey'>): boolean {
  return e.metaKey || e.ctrlKey
}
