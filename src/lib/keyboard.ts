/** ⌘（mac）または Ctrl（Windows/Linux）が押されているか */
export function isModKey(e: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey'>): boolean {
  return e.metaKey || e.ctrlKey
}

/** 入力中はブラウザのテキスト取り消し（⌘Z）を優先する */
export function isTextFieldUndoTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return false
}
