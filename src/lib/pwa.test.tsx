import { describe, expect, it, vi } from 'vitest'
import { consumeLaunch, type LaunchHandlers } from './pwa'

const handlers = () => ({ openView: vi.fn(), record: vi.fn(), openTask: vi.fn(), add: vi.fn() }) satisfies LaunchHandlers

const launchAt = (path: string) => window.history.replaceState(null, '', path)

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
