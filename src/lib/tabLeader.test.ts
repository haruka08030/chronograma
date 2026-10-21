import { afterEach, describe, expect, it, vi } from 'vitest'

/** Web Locks の偽物。`held` が true の間は ifAvailable で取れない。`release` で待っている頼みに渡す */
function fakeLocks(held: boolean) {
  let waiting: (() => void) | null = null
  const locks = {
    request: vi.fn((_name: string, optsOrCb: unknown, maybeCb?: (lock: unknown) => unknown) => {
      const ifAvailable = typeof optsOrCb === 'object' && (optsOrCb as { ifAvailable?: boolean }).ifAvailable
      const cb = (maybeCb ?? optsOrCb) as (lock: unknown) => unknown
      if (!held) {
        held = true
        cb({})
      } else if (ifAvailable) cb(null)
      else waiting = () => void cb({})
      return Promise.resolve()
    }),
  }
  return { locks, release: () => waiting?.() }
}

async function loadWith(held: boolean) {
  vi.resetModules()
  const fake = fakeLocks(held)
  vi.stubGlobal('navigator', { locks: fake.locks })
  const mod = await import('./tabLeader')
  return { ...mod, ...fake }
}

afterEach(() => vi.unstubAllGlobals())

describe('isLeaderTab（#451）', () => {
  it('ほかに代表がいなければ、最初に聞いたときから代表', async () => {
    const { isLeaderTab } = await loadWith(false)
    expect(await isLeaderTab()).toBe(true)
    expect(await isLeaderTab()).toBe(true)
  })

  it('ほかのタブが代表なら代表でなく、そのタブが閉じたら代わる', async () => {
    const { isLeaderTab, release, locks } = await loadWith(true)
    expect(await isLeaderTab()).toBe(false)
    expect(await isLeaderTab()).toBe(false)
    // 何度聞いても、頼むのは 1 回目（すぐ確かめる）と 2 回目（並んで待つ）だけ
    expect(locks.request).toHaveBeenCalledTimes(2)
    release()
    expect(await isLeaderTab()).toBe(true)
  })
})
