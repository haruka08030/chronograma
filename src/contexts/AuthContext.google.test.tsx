import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 起動時の Google の連携の確かめ（#422）。セッションの読み出しと INITIAL_SESSION・SIGNED_IN の通知が続けて来ても
 * 確かめるのは 1 回。前につながっていた人は確かめずに、すぐ予定を取りに行けるようにする
 */
const sb = vi.hoisted(() => ({
  listener: null as null | ((event: string, session: unknown) => void),
  status: vi.fn(async () => true),
}))
const session = { user: { id: 'u1' }, access_token: 'token-u1' }

vi.mock('../lib/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/supabase')>()),
  isSupabaseConfigured: true,
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        sb.listener = cb
        return { data: { subscription: { unsubscribe: () => {} } } }
      },
    },
  }),
}))
vi.mock('../lib/googleCalendar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/googleCalendar')>()),
  isGoogleCalendarConnected: sb.status,
  hasGoogleOAuthCallbackInUrl: () => false,
}))

/** 確かめた人の控えはモジュールにあるので、テストごとに読み込み直す */
async function startApp() {
  const { AuthProvider } = await import('./AuthContext')
  render(
    <AuthProvider>
      <div />
    </AuthProvider>,
  )
  await act(async () => {
    sb.listener!('INITIAL_SESSION', session)
    sb.listener!('SIGNED_IN', session)
    await new Promise((r) => setTimeout(r, 0))
  })
}

const connected = async () => (await import('../store/taskStore')).useTaskStore.getState().googleConnected

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  sb.status.mockClear()
})

describe('Google の連携の確かめ', () => {
  it('通知が何回来ても、同じ人には 1 回だけ確かめ、つながっていたことを覚える', async () => {
    await startApp()
    expect(sb.status).toHaveBeenCalledTimes(1)
    expect(await connected()).toBe(true)
    expect(localStorage.getItem('chronograma.googleConnected')).toBe('u1')
  })

  it('前につながっていた人は確かめずに、つながっている扱いで始める', async () => {
    localStorage.setItem('chronograma.googleConnected', 'u1')
    await startApp()
    expect(sb.status).not.toHaveBeenCalled()
    expect(await connected()).toBe(true)
  })

  it('別の人がつながっていた端末では確かめる', async () => {
    localStorage.setItem('chronograma.googleConnected', 'someone-else')
    sb.status.mockResolvedValueOnce(false)
    await startApp()
    expect(sb.status).toHaveBeenCalledTimes(1)
    expect(await connected()).toBe(false)
  })

  it('前に切れたままなら、確かめてつながらなければ「もう一度接続する」を出す（#449）', async () => {
    localStorage.setItem('chronograma.googleConnected', 'u1:lost')
    sb.status.mockResolvedValueOnce(false)
    await startApp()
    expect(sb.status).toHaveBeenCalledTimes(1)
    const { useTaskStore } = await import('../store/taskStore')
    expect(useTaskStore.getState().googleReconnectNeeded).toBe(true)
  })
})
