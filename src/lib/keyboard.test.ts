import { describe, expect, it } from 'vitest'
import { isCancelEscape, isImeKeyEvent, isTypingTarget, matchesHotkey, textAreaKeyAction } from './keyboard'

const taKey = (k: string, opts: { meta?: boolean; ctrl?: boolean; composing?: boolean; keyCode?: number } = {}) => ({
  key: k,
  metaKey: opts.meta ?? false,
  ctrlKey: opts.ctrl ?? false,
  nativeEvent: { isComposing: opts.composing ?? false, keyCode: opts.keyCode ?? 0 },
})

describe('textAreaKeyAction', () => {
  it('Enter だけなら改行（何もしない）', () => {
    expect(textAreaKeyAction(taKey('Enter'))).toBeNull()
  })

  it('⌘/Ctrl+Enter で確定', () => {
    expect(textAreaKeyAction(taKey('Enter', { meta: true }))).toBe('commit')
    expect(textAreaKeyAction(taKey('Enter', { ctrl: true }))).toBe('commit')
  })

  it('Esc で欄を離れる', () => {
    expect(textAreaKeyAction(taKey('Escape'))).toBe('leave')
  })

  it('変換中の Enter / Esc は変換のためのもの', () => {
    expect(textAreaKeyAction(taKey('Enter', { meta: true, composing: true }))).toBeNull()
    expect(textAreaKeyAction(taKey('Enter', { meta: true, keyCode: 229 }))).toBeNull()
    expect(textAreaKeyAction(taKey('Escape', { composing: true }))).toBeNull()
  })

  it('ほかのキーは何もしない', () => {
    expect(textAreaKeyAction(taKey('a', { meta: true }))).toBeNull()
  })
})

const key = (k: string, mods: Partial<Record<'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey', boolean>> = {}) => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
})

describe('matchesHotkey', () => {
  it('1 文字は修飾キーなしのときだけ合う', () => {
    expect(matchesHotkey(key('e'), 'e')).toBe(true)
    expect(matchesHotkey(key('e', { metaKey: true }), 'e')).toBe(false)
    expect(matchesHotkey(key('e', { ctrlKey: true }), 'e')).toBe(false)
    expect(matchesHotkey(key('e', { altKey: true }), 'e')).toBe(false)
    expect(matchesHotkey(key('E', { shiftKey: true }), 'e')).toBe(false)
  })

  it('? / などの記号は Shift を見ない', () => {
    expect(matchesHotkey(key('?', { shiftKey: true }), '?')).toBe(true)
    expect(matchesHotkey(key('?'), '?')).toBe(true)
    expect(matchesHotkey(key('/'), '/')).toBe(true)
    expect(matchesHotkey(key('?', { metaKey: true, shiftKey: true }), '?')).toBe(false)
  })

  it('mod は ⌘ と Ctrl のどちらでも合い、mod 付きの文字は大文字・小文字を区別しない', () => {
    expect(matchesHotkey(key('z', { metaKey: true }), 'mod+z')).toBe(true)
    expect(matchesHotkey(key('z', { ctrlKey: true }), 'mod+z')).toBe(true)
    expect(matchesHotkey(key('A', { metaKey: true }), 'mod+a')).toBe(true)
    expect(matchesHotkey(key('z'), 'mod+z')).toBe(false)
  })

  it('Shift は書いたときだけ合う（⌘Z と ⌘⇧Z を分ける）', () => {
    expect(matchesHotkey(key('Z', { metaKey: true, shiftKey: true }), 'mod+z')).toBe(false)
    expect(matchesHotkey(key('Z', { metaKey: true, shiftKey: true }), 'mod+shift+z')).toBe(true)
    expect(matchesHotkey(key('z', { metaKey: true, shiftKey: true }), 'mod+shift+z')).toBe(true)
    expect(matchesHotkey(key('ArrowDown', { shiftKey: true }), 'ArrowDown')).toBe(false)
    expect(matchesHotkey(key('ArrowDown', { shiftKey: true }), 'shift+ArrowDown')).toBe(true)
    expect(matchesHotkey(key('F10', { shiftKey: true }), 'shift+F10')).toBe(true)
    expect(matchesHotkey(key('L', { shiftKey: true }), 'shift+l')).toBe(true)
    expect(matchesHotkey(key('L', { shiftKey: true }), 'l')).toBe(false)
  })

  it('名前のキーと別名（Space・Esc）', () => {
    expect(matchesHotkey(key('Delete'), 'Delete')).toBe(true)
    expect(matchesHotkey(key('Backspace'), 'Delete')).toBe(false)
    expect(matchesHotkey(key(' '), 'Space')).toBe(true)
    expect(matchesHotkey(key('Escape'), 'Esc')).toBe(true)
    expect(matchesHotkey(key('Enter', { metaKey: true }), 'mod+Enter')).toBe(true)
    expect(matchesHotkey(key('Enter', { metaKey: true }), 'Enter')).toBe(false)
  })

  it('Alt+矢印（Mac の Option でも key は矢印のまま）。Alt を書いていなければ合わない', () => {
    expect(matchesHotkey(key('ArrowUp', { altKey: true }), 'alt+ArrowUp')).toBe(true)
    expect(matchesHotkey(key('ArrowDown', { altKey: true, shiftKey: true }), 'alt+shift+ArrowDown')).toBe(true)
    expect(matchesHotkey(key('ArrowDown', { altKey: true, shiftKey: true }), 'alt+ArrowDown')).toBe(false)
    expect(matchesHotkey(key('ArrowDown', { altKey: true }), 'ArrowDown')).toBe(false)
    expect(matchesHotkey(key('ArrowDown', { altKey: true }), 'shift+ArrowDown')).toBe(false)
    expect(matchesHotkey(key('ArrowDown'), 'alt+ArrowDown')).toBe(false)
  })

  it('Alt+文字はキーの位置（code）で見る（Mac の ⌥E は key が「´」）', () => {
    expect(matchesHotkey({ ...key('´', { altKey: true }), code: 'KeyE' }, 'alt+e')).toBe(true)
    expect(matchesHotkey({ ...key('¡', { altKey: true }), code: 'Digit1' }, 'alt+1')).toBe(true)
    expect(matchesHotkey({ ...key('´', { altKey: true }), code: 'KeyE' }, 'alt+r')).toBe(false)
    expect(matchesHotkey({ ...key('´', { altKey: true }), code: 'KeyE' }, 'e')).toBe(false)
  })

  it('空の書き方には何も合わない', () => {
    expect(matchesHotkey(key(''), '')).toBe(false)
  })
})

describe('isTypingTarget', () => {
  it('テキスト欄・選択・contenteditable は入力中', () => {
    expect(isTypingTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true)
    expect(isTypingTarget({ tagName: 'TEXTAREA' } as unknown as EventTarget)).toBe(true)
    expect(isTypingTarget({ tagName: 'SELECT' } as unknown as EventTarget)).toBe(true)
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)).toBe(true)
  })

  it('ボタン・ふつうの要素・window は入力中ではない', () => {
    expect(isTypingTarget({ tagName: 'BUTTON', isContentEditable: false } as unknown as EventTarget)).toBe(false)
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: false } as unknown as EventTarget)).toBe(false)
    expect(isTypingTarget({} as EventTarget)).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})

describe('isCancelEscape', () => {
  it('変換を取り消す Esc（変換中・Safari の keyCode 229）は取り消しの Esc ではない', () => {
    expect(isCancelEscape({ key: 'Escape', nativeEvent: { isComposing: false, keyCode: 27 } })).toBe(true)
    expect(isCancelEscape({ key: 'Escape', nativeEvent: { isComposing: true, keyCode: 27 } })).toBe(false)
    expect(isCancelEscape({ key: 'Escape', nativeEvent: { isComposing: false, keyCode: 229 } })).toBe(false)
    expect(isCancelEscape({ key: 'Enter', nativeEvent: { isComposing: false, keyCode: 13 } })).toBe(false)
  })
})

describe('isImeKeyEvent', () => {
  it('変換中、または keyCode 229（Safari の確定直後）は変換のキー', () => {
    expect(isImeKeyEvent({ isComposing: true, keyCode: 13 })).toBe(true)
    expect(isImeKeyEvent({ isComposing: false, keyCode: 229 })).toBe(true)
    expect(isImeKeyEvent({ isComposing: false, keyCode: 69 })).toBe(false)
  })
})
