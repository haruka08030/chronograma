// @vitest-environment jsdom
// 送った日を localStorage に残すので jsdom で回す
import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { noteAppVersion, resetVersionSeenForTests, VERSION_SEEN_KEY } from './versionSeen'
import { reportSyncError } from './errorReport'

vi.mock('./errorReport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./errorReport')>()),
  reportSyncError: vi.fn(),
}))

const client = (rpc: () => Promise<unknown>) => {
  const fn = vi.fn(rpc)
  return { c: { rpc: fn } as unknown as SupabaseClient, rpc: fn }
}

beforeEach(() => {
  localStorage.clear()
  resetVersionSeenForTests()
  vi.mocked(reportSyncError).mockClear()
})

describe('noteAppVersion', () => {
  it('送れたら端末に今日を残し、同じ日はもう送らない。別の人・次の日は送る', async () => {
    const { c, rpc } = client(async () => ({ data: null, error: null }))
    const day = new Date(2026, 9, 3, 12)
    await noteAppVersion(c, 'u1', day)
    await noteAppVersion(c, 'u1', day)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(VERSION_SEEN_KEY('u1'))).toMatch(/\|2026-10-03$/)
    await noteAppVersion(c, 'u2', day)
    expect(rpc).toHaveBeenCalledTimes(2)
    await noteAppVersion(c, 'u1', new Date(2026, 9, 4, 12))
    expect(rpc).toHaveBeenCalledTimes(3)
  })

  it('呼び出しが投げても投げ返さず、同期の失敗として残す。端末には残さない', async () => {
    const { c } = client(async () => {
      throw new Error('boom')
    })
    await expect(noteAppVersion(c, 'u1')).resolves.toBeUndefined()
    expect(reportSyncError).toHaveBeenCalledWith('version-seen', expect.any(Error))
    expect(localStorage.getItem(VERSION_SEEN_KEY('u1'))).toBeNull()
  })

  it('端末の保存が使えなくても送り、同じページでは 1 日 1 回', async () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    const { c, rpc } = client(async () => ({ data: null, error: null }))
    await noteAppVersion(c, 'u1')
    await noteAppVersion(c, 'u1')
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(reportSyncError).not.toHaveBeenCalled()
    get.mockRestore()
    set.mockRestore()
  })
})
