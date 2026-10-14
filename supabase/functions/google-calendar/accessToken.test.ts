import { describe, expect, it, vi } from 'vitest'
import { TOKEN_MARGIN_MS, withAccessToken, type AccessTokenDeps } from './accessToken'
import { GoogleApiError } from './googleError'

const NOW = Date.parse('2026-10-14T10:00:00Z')

function deps(cached: AccessTokenDeps['cached'], over: Partial<AccessTokenDeps> = {}) {
  return {
    cached,
    open: vi.fn(async (sealed: string) => sealed.replace('sealed:', '')),
    refresh: vi.fn(async () => ({ accessToken: 'new-token', expiresIn: 3599 })),
    save: vi.fn(),
    now: () => NOW,
    ...over,
  }
}

const later = (ms: number) => new Date(NOW + ms).toISOString()
const rejected = () => new GoogleApiError('calendar', 401, [], 'Invalid Credentials')

describe('withAccessToken', () => {
  it('保存してあるトークンが十分に残っていれば、作り直さずに使う', async () => {
    const d = deps({ sealed: 'sealed:old-token', expiresAt: later(30 * 60_000) })
    const use = vi.fn(async (t: string) => t)
    expect(await withAccessToken(d, use)).toBe('old-token')
    expect(d.refresh).not.toHaveBeenCalled()
    expect(d.save).not.toHaveBeenCalled()
  })

  it('残りが少ない・無い・開けないときは作り直して保存する', async () => {
    for (const d of [
      deps({ sealed: 'sealed:old-token', expiresAt: later(TOKEN_MARGIN_MS - 1) }),
      deps({ sealed: null, expiresAt: null }),
      deps(
        { sealed: 'sealed:old-token', expiresAt: later(30 * 60_000) },
        {
          open: vi.fn(async () => {
            throw new Error('bad key')
          }),
        },
      ),
    ]) {
      expect(await withAccessToken(d, async (t) => t)).toBe('new-token')
      expect(d.save).toHaveBeenCalledWith('new-token', new Date(NOW + 3599 * 1000))
    }
  })

  it('保存してあったトークンが断られたら、作り直して 1 回だけやり直す', async () => {
    const d = deps({ sealed: 'sealed:old-token', expiresAt: later(30 * 60_000) })
    const use = vi.fn(async (t: string) => {
      if (t === 'old-token') throw rejected()
      return t
    })
    expect(await withAccessToken(d, use)).toBe('new-token')
    expect(use).toHaveBeenCalledTimes(2)
  })

  it('作り直したトークンが断られたら、やり直さずに投げる', async () => {
    const d = deps({ sealed: null, expiresAt: null })
    const use = vi.fn(async () => {
      throw rejected()
    })
    await expect(withAccessToken(d, use)).rejects.toBeInstanceOf(GoogleApiError)
    expect(use).toHaveBeenCalledTimes(1)
  })

  it('401 以外の失敗（利用上限など）では作り直さない', async () => {
    const d = deps({ sealed: 'sealed:old-token', expiresAt: later(30 * 60_000) })
    const use = vi.fn(async () => {
      throw new GoogleApiError('calendar', 403, ['rateLimitExceeded'], '')
    })
    await expect(withAccessToken(d, use)).rejects.toThrow(/403/)
    expect(d.refresh).not.toHaveBeenCalled()
  })
})
