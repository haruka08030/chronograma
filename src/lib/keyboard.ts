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

/**
 * 確定の Enter か。日本語の変換を確定する Enter は除く
 * （Safari は確定直後の Enter を isComposing=false で送ることがあるので keyCode 229 も見る）。
 * テンキーの Enter も key は 'Enter' で来る
 */
export function isSubmitEnter(e: { key: string; nativeEvent: KeyboardEvent }): boolean {
  return e.key === 'Enter' && !e.nativeEvent.isComposing && e.nativeEvent.keyCode !== 229
}
