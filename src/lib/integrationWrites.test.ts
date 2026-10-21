import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n/config'
import { flushIntegrationWrites, registerIntegrationWrites, signOutWarning } from './integrationWrites'

/** ログアウトの前に連携への送り待ちを送ってみる（送り待ちはログアウトで消えるので、残った数を確かめに出す） */
const stops: Array<() => void> = []
afterEach(() => {
  stops.splice(0).forEach((stop) => stop())
  vi.useRealTimers()
})

describe('flushIntegrationWrites', () => {
  it('登録された連携を全部送ってみて、残った数だけを返す', async () => {
    const queues = { google: 2, notion: 1, canvas: 1 }
    stops.push(registerIntegrationWrites('google', { flush: async () => void (queues.google = 0), count: () => queues.google }))
    stops.push(registerIntegrationWrites('notion', { flush: async () => {}, count: () => queues.notion }))
    stops.push(registerIntegrationWrites('canvas', { flush: () => Promise.reject(new Error('offline')), count: () => queues.canvas }))
    expect(await flushIntegrationWrites()).toEqual({ notion: 1, canvas: 1 })
  })

  it('送るのが長引いても待ち続けない（その時点の数を返す）', async () => {
    vi.useFakeTimers()
    stops.push(registerIntegrationWrites('notion', { flush: () => new Promise(() => {}), count: () => 3 }))
    const result = flushIntegrationWrites(1_000)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(await result).toEqual({ notion: 3 })
  })

  it('外したものは送らない。後から同じ名前で登録したものは前の外しで消えない', async () => {
    const first = vi.fn(async () => {})
    const second = vi.fn(async () => {})
    const stopFirst = registerIntegrationWrites('google', { flush: first, count: () => 0 })
    stops.push(registerIntegrationWrites('google', { flush: second, count: () => 0 }))
    stopFirst()
    await flushIntegrationWrites()
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()
  })
})

describe('signOutWarning', () => {
  it('全部送れていれば確かめない。クラウドだけなら前と同じ文', () => {
    expect(signOutWarning(true, {})).toBeNull()
    expect(signOutWarning(false, {})).toBe(i18n.t('account.signOutUnsynced'))
  })

  it('送れていない連携の名前と合計の件数を出す', async () => {
    const before = i18n.language
    await i18n.changeLanguage('ja')
    expect(signOutWarning(true, { notion: 1, google: 2 })).toBe(
      'Google カレンダー・Notion に 3 件を送れていません。ログアウトすると、この分は送られません。ログアウトしますか？',
    )
    expect(signOutWarning(false, { canvas: 1 })).toBe(
      `${i18n.t('account.signOutUnsynced')}\n\nCanvas に 1 件を送れていません。ログアウトすると、この分は送られません。`,
    )
    await i18n.changeLanguage('en')
    expect(signOutWarning(true, { canvas: 2 })).toBe(
      "2 changes haven't reached Canvas yet. If you sign out, they won't be sent. Sign out anyway?",
    )
    await i18n.changeLanguage(before)
  })
})
