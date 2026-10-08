import { afterEach, describe, expect, it, vi } from 'vitest'
import { consumeLaunch, type LaunchHandlers } from './pwa'

const handlers = () =>
  ({ openView: vi.fn(), record: vi.fn(), openTask: vi.fn(), stopTimer: vi.fn(), add: vi.fn() }) satisfies LaunchHandlers

const launchAt = (path: string) => window.history.replaceState(null, '', path)

/** Service Worker が控えに置く 1 回きりの印（launch）の偽物 */
function stubLaunchCache(nonces: string[]) {
  const store = new Set(nonces.map((n) => `/__launch/${n}`))
  vi.stubGlobal('caches', {
    open: async () => ({
      match: async (key: string) => (store.has(key) ? new Response('1') : undefined),
      delete: async (key: string) => store.delete(key),
    }),
  })
  return store
}

afterEach(() => vi.unstubAllGlobals())

describe('consumeLaunch', () => {
  it('?task=&date= を読んで詳細を開き、URL から消す（画面の指定は残す）', () => {
    launchAt('/?view=planner&task=t1&date=2026-10-09')
    const h = handlers()
    consumeLaunch(h)
    expect(h.openTask).toHaveBeenCalledWith({ taskId: 't1', date: '2026-10-09' })
    expect(h.record).not.toHaveBeenCalled()
    expect(window.location.search).toBe('?view=planner')
  })

  it('日付の形でない date は無視する', () => {
    launchAt('/?task=t1&date=tomorrow')
    const h = handlers()
    consumeLaunch(h)
    expect(h.openTask).toHaveBeenCalledWith({ taskId: 't1', date: null })
  })

  it('?record= は今までどおり記録の画面', () => {
    launchAt('/?record=t2')
    const h = handlers()
    consumeLaunch(h)
    expect(h.record).toHaveBeenCalledWith({ taskId: 't2', asPlanned: false })
    expect(h.openTask).not.toHaveBeenCalled()
  })
})

describe('consumeLaunch: 止め忘れの「止める」', () => {
  it('通知から開いた印があれば、そのタイマーを止める（印は 1 回で消える）', async () => {
    const store = stubLaunchCache(['n1'])
    launchAt('/?view=planner&stop-timer=2026-10-08T01%3A00%3A00.000Z&launch=n1')
    const h = handlers()
    consumeLaunch(h)
    await vi.waitFor(() => expect(h.stopTimer).toHaveBeenCalledWith({ startedAt: '2026-10-08T01:00:00.000Z' }))
    expect(store.size).toBe(0)
    expect(window.location.search).toBe('?view=planner')
  })

  it('印が無い（ただのリンク）なら止めない', async () => {
    stubLaunchCache([])
    launchAt('/?view=planner&stop-timer=2026-10-08T01%3A00%3A00.000Z&launch=forged')
    const h = handlers()
    consumeLaunch(h)
    await new Promise((r) => setTimeout(r, 10))
    expect(h.stopTimer).not.toHaveBeenCalled()
  })

  it('開始時刻の分からない古い通知（stop-timer=1）は startedAt: null', async () => {
    stubLaunchCache(['n2'])
    launchAt('/?stop-timer=1&launch=n2')
    const h = handlers()
    consumeLaunch(h)
    await vi.waitFor(() => expect(h.stopTimer).toHaveBeenCalledWith({ startedAt: null }))
  })
})
