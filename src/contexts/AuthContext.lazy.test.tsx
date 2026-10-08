import { useEffect } from 'react'
import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ログインしていない人は起動時に Supabase を読まない（#268）。ログインを始めたとき・ほかのタブでログインしたときに読み、
 * 読んだクライアントのセッションに入る
 */
const sb = vi.hoisted(() => ({
  client: null as null | object,
  loaded: [] as ((c: object) => void)[],
  atStart: false,
  listener: null as null | ((event: string, session: unknown) => void),
  signInWithOtp: vi.fn(async () => ({ error: null })),
}))
const fakeClient = () => ({
  auth: {
    getSession: async () => ({ data: { session: null } }),
    onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
      sb.listener = cb
      return { data: { subscription: { unsubscribe: () => {} } } }
    },
    signInWithOtp: sb.signInWithOtp,
  },
})
const loadSupabase = vi.hoisted(() => vi.fn())

vi.mock('../lib/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/supabase')>()),
  isSupabaseConfigured: true,
  getSupabase: () => sb.client,
  needsSupabaseAtStart: () => sb.atStart,
  loadSupabase,
  onSupabaseLoaded: (cb: (c: object) => void) => {
    if (sb.client) cb(sb.client)
    sb.loaded.push(cb)
    return () => {}
  },
}))
vi.mock('../lib/googleCalendar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/googleCalendar')>()),
  isGoogleCalendarConnected: async () => false,
  hasGoogleOAuthCallbackInUrl: () => false,
}))

const { AuthProvider, useAuth } = await import('./AuthContext')

beforeEach(() => {
  sb.client = null
  sb.loaded = []
  sb.atStart = false
  sb.listener = null
  sb.signInWithOtp.mockClear()
  loadSupabase.mockReset()
  loadSupabase.mockImplementation(async () => {
    sb.client ??= fakeClient()
    for (const cb of sb.loaded) cb(sb.client)
    return sb.client
  })
})

const probe = { auth: null as unknown as ReturnType<typeof useAuth> }
function Probe() {
  const auth = useAuth()
  useEffect(() => {
    probe.auth = auth
  })
  return null
}
async function renderAuth() {
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  )
  await act(async () => {})
}

describe('AuthProvider: Supabase を読むとき（#268）', () => {
  it('セッションが保存されていなければ読まず、待たない（ログインしていない表示のまま）', async () => {
    await renderAuth()
    expect(loadSupabase).not.toHaveBeenCalled()
    expect(probe.auth.loading).toBe(false)
    expect(probe.auth.user).toBeNull()
  })

  it('セッションが保存されていれば起動時に読み、セッションの変化を受ける', async () => {
    sb.atStart = true
    await renderAuth()
    expect(loadSupabase).toHaveBeenCalledTimes(1)
    expect(sb.listener).not.toBeNull()
    expect(probe.auth.loading).toBe(false)
  })

  it('メールでログインを始めたときに読んで送る', async () => {
    await renderAuth()
    let res: { error?: string } = {}
    await act(async () => {
      res = await probe.auth.signInWithOtp('a@example.com')
    })
    expect(loadSupabase).toHaveBeenCalledTimes(1)
    expect(sb.signInWithOtp).toHaveBeenCalledWith(expect.objectContaining({ email: 'a@example.com' }))
    expect(res).toEqual({})
    // 読んだクライアントのセッションの変化も受ける（コードを入れてログインしたとき SIGNED_IN が届く）
    expect(sb.listener).not.toBeNull()
  })

  it('読めなかった（オフライン）ときは回線のエラーを出す', async () => {
    loadSupabase.mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await renderAuth()
    let res: { error?: string } = {}
    await act(async () => {
      res = await probe.auth.signInWithOtp('a@example.com')
    })
    expect(res.error).toBe('Could not reach the server. Check your connection and try again.')
  })

  it('ほかのタブでログインしたら（セッションのキーが書かれたら）読む', async () => {
    await renderAuth()
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'sb-abcd-auth-token', newValue: '{}' }))
    })
    expect(loadSupabase).toHaveBeenCalledTimes(1)
    expect(sb.listener).not.toBeNull()
    // ほかのキー・消えたときは読まない
    loadSupabase.mockClear()
    window.dispatchEvent(new StorageEvent('storage', { key: 'chronograma-storage', newValue: '{}' }))
    window.dispatchEvent(new StorageEvent('storage', { key: 'sb-abcd-auth-token', newValue: null }))
    expect(loadSupabase).not.toHaveBeenCalled()
  })
})
