import { describe, expect, it } from 'vitest'
import { textAreaKeyAction } from './keyboard'

const key = (k: string, opts: { meta?: boolean; ctrl?: boolean; composing?: boolean; keyCode?: number } = {}) => ({
  key: k,
  metaKey: opts.meta ?? false,
  ctrlKey: opts.ctrl ?? false,
  nativeEvent: { isComposing: opts.composing ?? false, keyCode: opts.keyCode ?? 0 },
})

describe('textAreaKeyAction', () => {
  it('Enter だけなら改行（何もしない）', () => {
    expect(textAreaKeyAction(key('Enter'))).toBeNull()
  })

  it('⌘/Ctrl+Enter で確定', () => {
    expect(textAreaKeyAction(key('Enter', { meta: true }))).toBe('commit')
    expect(textAreaKeyAction(key('Enter', { ctrl: true }))).toBe('commit')
  })

  it('Esc で欄を離れる', () => {
    expect(textAreaKeyAction(key('Escape'))).toBe('leave')
  })

  it('変換中の Enter / Esc は変換のためのもの', () => {
    expect(textAreaKeyAction(key('Enter', { meta: true, composing: true }))).toBeNull()
    expect(textAreaKeyAction(key('Enter', { meta: true, keyCode: 229 }))).toBeNull()
    expect(textAreaKeyAction(key('Escape', { composing: true }))).toBeNull()
  })

  it('ほかのキーは何もしない', () => {
    expect(textAreaKeyAction(key('a', { meta: true }))).toBeNull()
  })
})
