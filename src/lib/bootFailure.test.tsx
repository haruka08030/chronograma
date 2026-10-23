import { afterEach, describe, expect, it, vi } from 'vitest'
import { bootLanguage, renderBootFailure } from './bootFailure'
import { startAfterDataLoaded } from './startAfterDataLoaded'
import { hasTypingInProgress } from './pendingEdits'

const reloadPage = vi.hoisted(() => vi.fn())
vi.mock('./reloadPage', () => ({ reloadPage }))

afterEach(() => {
  localStorage.removeItem('chronograma-lang')
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

describe('起動に失敗したとき', () => {
  it('本体が読めなければ onStartFailed に渡す（真っ白のまま止めない）', async () => {
    const err = new TypeError('Failed to fetch dynamically imported module: https://a/assets/boot-old.js')
    const onStartFailed = vi.fn()
    await startAfterDataLoaded(
      () => Promise.resolve(),
      () => Promise.reject(err),
      onStartFailed,
    )
    expect(onStartFailed).toHaveBeenCalledWith(err)
  })

  it('React なしで「起動できませんでした」と再読み込みを出す', () => {
    const root = document.createElement('div')
    document.body.append(root)
    renderBootFailure(root, 'ja')
    expect(root.querySelector('[role="alert"] h1')?.textContent).toBe('起動できませんでした')
    const button = root.querySelector('button')!
    expect(button.textContent).toBe('再読み込み')
    button.click()
    expect(reloadPage).toHaveBeenCalledTimes(1)
    renderBootFailure(root, 'en')
    expect(root.querySelector('h1')?.textContent).toBe("Couldn't start")
    expect(root.querySelectorAll('[role="alert"]')).toHaveLength(1)
  })

  it('言語は設定、無ければブラウザの言語に合わせる', () => {
    vi.stubGlobal('navigator', { language: 'ja-JP' })
    expect(bootLanguage()).toBe('ja')
    localStorage.setItem('chronograma-lang', 'en')
    expect(bootLanguage()).toBe('en')
    localStorage.removeItem('chronograma-lang')
    vi.stubGlobal('navigator', { language: 'fr-FR' })
    expect(bootLanguage()).toBe('en')
  })
})

describe('hasTypingInProgress', () => {
  it('文字の入った欄にカーソルがあるときだけ', () => {
    const input = document.createElement('input')
    const checkbox = Object.assign(document.createElement('input'), { type: 'checkbox' })
    document.body.append(input, checkbox)
    input.focus()
    expect(hasTypingInProgress()).toBe(false)
    input.value = '課題'
    expect(hasTypingInProgress()).toBe(true)
    checkbox.focus()
    expect(hasTypingInProgress()).toBe(false)
  })
})
