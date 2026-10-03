/** Mac（と iPad・iPhone）か。キーの表示（⌘ / Ctrl）を決める */
export const IS_MAC = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent)

/** 修飾キーの表示。Mac は ⌘、それ以外は Ctrl */
export function modKeyLabel(): string {
  return IS_MAC ? '⌘' : 'Ctrl'
}

/**
 * ショートカットの表示。'mod' は ⌘ / Ctrl に置き換える。Mac は詰めて（⌘Z）、それ以外は + でつなぐ（Ctrl+Z）
 *   shortcutLabel(['mod', 'Z'])
 */
export function shortcutLabel(keys: string[]): string {
  const parts = keys.map((k) => (k === 'mod' ? modKeyLabel() : k))
  return parts.join(IS_MAC ? '' : '+')
}

/** ⌘（mac）または Ctrl（Windows/Linux）が押されているか */
export function isModKey(e: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey'>): boolean {
  return e.metaKey || e.ctrlKey
}

/**
 * 入力中か（テキスト欄・選択・contenteditable）。ショートカットはここでは効かせず、
 * ⌘Z もブラウザのテキスト取り消しを優先する。DOM の無いテストでも使えるよう形で見る
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as { tagName?: unknown; isContentEditable?: unknown } | null
  if (!el || typeof el.tagName !== 'string') return false
  const tag = el.tagName.toUpperCase()
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true
}

/**
 * 日本語の変換中のキーか。変換中・変換を確定/取り消すキーではショートカットを動かさない
 * （Safari は確定直後のキーを isComposing=false で送ることがあるので keyCode 229 も見る）
 */
export function isImeKeyEvent(e: Pick<KeyboardEvent, 'isComposing' | 'keyCode'>): boolean {
  return e.isComposing || e.keyCode === 229
}

type HotkeyEvent = Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>

/** 一覧やヒントに出す名前 → KeyboardEvent.key */
const KEY_ALIASES: Record<string, string> = { Space: ' ', Esc: 'Escape' }

/**
 * キーの書き方（'e'・'Delete'・'mod+Enter'・'shift+ArrowDown'・'?'）に押したキーが合うか。
 * - mod（⌘ / Ctrl）・alt・shift は書いたものだけを押しているときに合う（⌘E で e は動かない）
 * - ? / などの記号は Shift で打つ配列があるので Shift を見ない
 * - mod 付きの文字は大文字・小文字を区別しない（⌘⇧Z が 'Z' で来るブラウザがある）
 */
export function matchesHotkey(e: HotkeyEvent, spec: string): boolean {
  const parts = spec.split('+')
  const raw = parts.pop() ?? ''
  const key = KEY_ALIASES[raw] ?? raw
  if (!key) return false
  const mod = parts.includes('mod')
  if (isModKey(e) !== mod) return false
  if (e.altKey !== parts.includes('alt')) return false
  const symbol = key.length === 1 && key !== ' ' && key.toLowerCase() === key.toUpperCase()
  if (!symbol && e.shiftKey !== parts.includes('shift')) return false
  if (mod && key.length === 1) return e.key.toLowerCase() === key.toLowerCase()
  return e.key === key
}

/**
 * 確定の Enter か。日本語の変換を確定する Enter は除く
 * （Safari は確定直後の Enter を isComposing=false で送ることがあるので keyCode 229 も見る）。
 * テンキーの Enter も key は 'Enter' で来る
 */
export function isSubmitEnter(e: { key: string; nativeEvent: Pick<KeyboardEvent, 'isComposing' | 'keyCode'> }): boolean {
  return e.key === 'Enter' && !e.nativeEvent.isComposing && e.nativeEvent.keyCode !== 229
}

/**
 * 複数行の欄（メモ）でのキーの意味。Enter はふつうに改行（null）
 * - ⌘/Ctrl+Enter: 'commit'（確定して欄を離れる）
 * - Esc: 'leave'（欄を離れる。書いた分は捨てない）
 * 変換中の Enter / Esc は変換のためのものなので何もしない
 */
export function textAreaKeyAction(e: {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  nativeEvent: Pick<KeyboardEvent, 'isComposing' | 'keyCode'>
}): 'commit' | 'leave' | null {
  if (isModKey(e) && isSubmitEnter(e)) return 'commit'
  if (e.key === 'Escape' && !e.nativeEvent.isComposing) return 'leave'
  return null
}
