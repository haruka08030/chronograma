// @vitest-environment jsdom
// 起動 URL を読んで消すので window.location / history を使う
import { afterEach, describe, expect, it, vi } from 'vitest'
import { consumeLaunch } from './pwa'

function handlers() {
  return { openView: vi.fn(), record: vi.fn(), add: vi.fn(), start: vi.fn(), openTask: vi.fn(), stopTimer: vi.fn(), wrapUp: vi.fn() }
}

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('consumeLaunch', () => {
  it('?start=last を読んで URL から消す（読み込み直しでもう一度始めない）', () => {
    window.history.replaceState(null, '', '/?start=last&source=pwa#x')
    const h = handlers()
    consumeLaunch(h)
    expect(h.start).toHaveBeenCalledWith('last')
    expect(h.add).not.toHaveBeenCalled()
    expect(window.location.search).toBe('')
    expect(window.location.hash).toBe('#x')

    consumeLaunch(h)
    expect(h.start).toHaveBeenCalledTimes(1)
  })

  it('知らない ?start= は無視して消す。画面の指定（?view=）は残す', () => {
    window.history.replaceState(null, '', '/?start=nope&view=planner')
    const h = handlers()
    consumeLaunch(h)
    expect(h.start).not.toHaveBeenCalled()
    expect(window.location.search).toBe('?view=planner')
  })

  it('?add=1 は追加を開く', () => {
    window.history.replaceState(null, '', '/?add=1')
    const h = handlers()
    consumeLaunch(h)
    expect(h.add).toHaveBeenCalledTimes(1)
    expect(h.add).toHaveBeenCalledWith(null)
    expect(h.start).not.toHaveBeenCalled()
    expect(window.location.search).toBe('')
  })
})

describe('consumeLaunch: ほかのアプリの共有（share_target、#280）', () => {
  it('title・text・url を読んで追加欄の中身を渡し、URL から消す（画面の指定は残す）', () => {
    const q = new URLSearchParams({ add: '1', title: '本選考エントリー', text: '', url: 'https://example.com/e' })
    window.history.replaceState(null, '', `/?view=planner&${q}`)
    const h = handlers()
    consumeLaunch(h)
    expect(h.add).toHaveBeenCalledWith({ text: '本選考エントリー https://example.com/e', note: '' })
    expect(window.location.search).toBe('?view=planner')

    // 読み込み直しても同じ共有をもう一度入れない
    consumeLaunch(h)
    expect(h.add).toHaveBeenCalledTimes(1)
  })

  it('URL が text に入って届いても取り出す', () => {
    const q = new URLSearchParams({ add: '1', text: '説明会 https://example.com/s' })
    window.history.replaceState(null, '', `/?${q}`)
    const h = handlers()
    consumeLaunch(h)
    expect(h.add).toHaveBeenCalledWith({ text: '説明会 https://example.com/s', note: '' })
    expect(window.location.search).toBe('')
  })

  it('add=1 が無ければ title などは読まず、消さない', () => {
    window.history.replaceState(null, '', '/?title=x&text=y')
    const h = handlers()
    consumeLaunch(h)
    expect(h.add).not.toHaveBeenCalled()
    expect(window.location.search).toBe('?title=x&text=y')
  })
})
