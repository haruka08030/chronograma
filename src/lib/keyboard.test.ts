import { describe, expect, it } from 'vitest'
import { isImeKeyEvent, isTypingTarget, matchesHotkey } from './keyboard'

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
  })

  it('名前のキーと別名（Space・Esc）', () => {
    expect(matchesHotkey(key('Delete'), 'Delete')).toBe(true)
    expect(matchesHotkey(key('Backspace'), 'Delete')).toBe(false)
    expect(matchesHotkey(key(' '), 'Space')).toBe(true)
    expect(matchesHotkey(key('Escape'), 'Esc')).toBe(true)
    expect(matchesHotkey(key('Enter', { metaKey: true }), 'mod+Enter')).toBe(true)
    expect(matchesHotkey(key('Enter', { metaKey: true }), 'Enter')).toBe(false)
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

describe('isImeKeyEvent', () => {
  it('変換中、または keyCode 229（Safari の確定直後）は変換のキー', () => {
    expect(isImeKeyEvent({ isComposing: true, keyCode: 13 })).toBe(true)
    expect(isImeKeyEvent({ isComposing: false, keyCode: 229 })).toBe(true)
    expect(isImeKeyEvent({ isComposing: false, keyCode: 69 })).toBe(false)
  })
})
