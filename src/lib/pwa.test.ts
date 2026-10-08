// @vitest-environment jsdom
// 起動 URL を読んで消すので window.location / history を使う
import { afterEach, describe, expect, it, vi } from 'vitest'
import { consumeLaunch } from './pwa'

function handlers() {
  return { openView: vi.fn(), record: vi.fn(), add: vi.fn(), start: vi.fn() }
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
    expect(h.start).not.toHaveBeenCalled()
    expect(window.location.search).toBe('')
  })
})
