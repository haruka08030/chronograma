// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Google に送る待ち（#487）: 送れない変更を捨てない・1 件の失敗で止まらない・タブ同士で上書きしない */
vi.mock('./errorReport', () => ({ reportFailure: vi.fn() }))

const { GoogleCalendarError } = await import('./googleCalendar')
const {
  MAX_PUSH_TRIES,
  enqueuePush,
  failedPushCount,
  loadPushQueue,
  pushPass,
  pushQueueKey,
  resetFailedPush,
  sendablePushIds,
  settlePush,
  clearPushQueues,
} = await import('./googlePushQueue')

const U = 'u1'
const ids = () => Object.keys(loadPushQueue(U)).sort()
const fail = (code: string | null, message = 'x') => new GoogleCalendarError(message, code)

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('待ちの保存', () => {
  it('前の版の形（ID の並び）も読める', () => {
    localStorage.setItem(pushQueueKey(U), JSON.stringify(['a', 'b']))
    expect(ids()).toEqual(['a', 'b'])
  })

  it('ほかのタブが足したものを上書きしない（読み込み→合わせて→書く）', () => {
    enqueuePush(U, ['a'])
    // ほかのタブが b を足した
    const other = JSON.parse(localStorage.getItem(pushQueueKey(U))!)
    other.b = { at: 1, tries: 0 }
    localStorage.setItem(pushQueueKey(U), JSON.stringify(other))
    settlePush(U, 'a', loadPushQueue(U).a.at)
    expect(ids()).toEqual(['b'])
  })

  it('送っている間に直したものは、送れても外さない', () => {
    enqueuePush(U, ['a'])
    const sentAt = loadPushQueue(U).a.at
    enqueuePush(U, ['a'])
    settlePush(U, 'a', sentAt)
    expect(ids()).toEqual(['a'])
  })

  it('連携を外したら捨てる', () => {
    enqueuePush(U, ['a'])
    enqueuePush('u2', ['b'])
    localStorage.setItem('other', '1')
    clearPushQueues()
    expect(ids()).toEqual([])
    expect(localStorage.getItem('other')).toBe('1')
  })
})

describe('pushPass', () => {
  it('全部送れたら空になる', async () => {
    enqueuePush(U, ['a', 'b'])
    const send = vi.fn<(id: string) => Promise<void>>(async () => {})
    expect(await pushPass(U, send)).toBe('done')
    expect(send.mock.calls.map((c) => c[0])).toEqual(['a', 'b'])
    expect(ids()).toEqual([])
  })

  it('つながりが切れた・許可が無いときは待ちを残して止まる', async () => {
    enqueuePush(U, ['a', 'b'])
    expect(await pushPass(U, async () => Promise.reject(fail('google_auth_expired')))).toBe('auth')
    expect(ids()).toEqual(['a', 'b'])
    expect(await pushPass(U, async () => Promise.reject(fail('google_not_connected')))).toBe('auth')
    expect(await pushPass(U, async () => Promise.reject(fail('google_scope_missing')))).toBe('scope')
    expect(ids()).toEqual(['a', 'b'])
    // 数えない
    expect(Object.values(loadPushQueue(U)).every((e) => e.tries === 0)).toBe(true)
  })

  it('前の版の関数（code なし）の「つながっていない」「書き込みの許可が無い」も同じ', async () => {
    enqueuePush(U, ['a'])
    expect(await pushPass(U, async () => Promise.reject(new Error('Google Calendar not connected. Reconnect in settings.')))).toBe('auth')
    expect(
      await pushPass(U, async () =>
        Promise.reject(new Error('Google Calendar write scope not granted. Reconnect and approve calendar access.')),
      ),
    ).toBe('scope')
    expect(ids()).toEqual(['a'])
  })

  it('文言に reconnect があっても、code が別なら待ちを消さない', async () => {
    enqueuePush(U, ['a'])
    expect(await pushPass(U, async () => Promise.reject(fail('google_failed', 'please reconnect read-only')))).toBe('retry')
    expect(ids()).toEqual(['a'])
  })

  it('他人の予定（読み取りだけ）はその 1 件だけ外して次を送る', async () => {
    enqueuePush(U, ['a', 'b'])
    const send = vi.fn(async (id: string) => {
      if (id === 'a') throw fail('google_read_only')
    })
    expect(await pushPass(U, send)).toBe('done')
    expect(send).toHaveBeenCalledTimes(2)
    expect(ids()).toEqual([])
  })

  it('送りすぎ・回線の失敗は数えずに待つ', async () => {
    enqueuePush(U, ['a'])
    expect(await pushPass(U, async () => Promise.reject(fail('google_rate_limited')))).toBe('wait')
    expect(await pushPass(U, async () => Promise.reject(new TypeError('Failed to fetch')))).toBe('wait')
    expect(loadPushQueue(U).a.tries).toBe(0)
  })

  it('1 件が送れなくても飛ばして後ろを送り、上限まで送れなければ「送れていない」に数える', async () => {
    enqueuePush(U, ['bad', 'good'])
    const send = vi.fn(async (id: string) => {
      if (id === 'bad') throw fail('google_failed')
    })
    expect(await pushPass(U, send)).toBe('retry')
    expect(ids()).toEqual(['bad'])
    for (let i = 1; i < MAX_PUSH_TRIES; i++) await pushPass(U, send)
    const q = loadPushQueue(U)
    expect(sendablePushIds(q)).toEqual([])
    expect(failedPushCount(q)).toBe(1)
    // 上限を超えたものは自動では送らない
    send.mockClear()
    expect(await pushPass(U, send)).toBe('done')
    expect(send).not.toHaveBeenCalled()
    // 「もう一度送る」
    resetFailedPush(U)
    expect(sendablePushIds(loadPushQueue(U))).toEqual(['bad'])
    // 直したら数え直す
    for (let i = 0; i < MAX_PUSH_TRIES; i++) await pushPass(U, send)
    enqueuePush(U, ['bad'])
    expect(failedPushCount(loadPushQueue(U))).toBe(0)
  })

  it('Google で消されていた予定は待ちから外して知らせ、次を送る（#494）', async () => {
    enqueuePush(U, ['gone', 'b'])
    const deleted: string[] = []
    const send = vi.fn(async (id: string) => {
      if (id === 'gone') throw fail('google_deleted')
    })
    expect(await pushPass(U, send, undefined, (id) => deleted.push(id))).toBe('done')
    expect(deleted).toEqual(['gone'])
    expect(ids()).toEqual([])
  })

  it('アプリが Google から消した予定は「戻す」を付けて送り、直しても付けたまま', async () => {
    enqueuePush(U, ['a'], new Set(['a']))
    enqueuePush(U, ['a'])
    enqueuePush(U, ['b'])
    const send = vi.fn<(id: string, revive: boolean) => Promise<void>>(async () => {})
    await pushPass(U, send)
    expect(send.mock.calls).toEqual([
      ['a', true],
      ['b', false],
    ])
  })

  it('ほかのタブが送り終えたものは送らない', async () => {
    enqueuePush(U, ['a', 'b'])
    const send = vi.fn(async (id: string) => {
      if (id === 'a') {
        const q = loadPushQueue(U)
        delete q.b
        localStorage.setItem(pushQueueKey(U), JSON.stringify(q))
      }
    })
    await pushPass(U, send)
    expect(send.mock.calls.map((c) => c[0])).toEqual(['a'])
  })
})
