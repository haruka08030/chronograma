import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../store/taskStore'

/**
 * SIGNED_OUT の片付け（#341）。別の端末でアカウントを消されると、この端末はトークンを更新できず SIGNED_OUT になる。
 * そのときは最後のアクセストークンで聞き、アカウントがもう無ければ控えを取らずに消す
 */
const sb = vi.hoisted(() => ({
  listener: null as null | ((event: string, session: unknown) => void),
  gone: false,
  getUser: vi.fn(),
}))

vi.mock('../lib/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/supabase')>()),
  isSupabaseConfigured: true,
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'u1' }, access_token: 'token-u1' } } }),
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        sb.listener = cb
        return { data: { subscription: { unsubscribe: () => {} } } }
      },
      getUser: sb.getUser,
    },
  }),
}))
// Google の連携の確かめ・通知の購読・自動バックアップ（IndexedDB）はここでは見ない
vi.mock('../lib/googleCalendar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/googleCalendar')>()),
  isGoogleCalendarConnected: async () => false,
  hasGoogleOAuthCallbackInUrl: () => false,
}))
vi.mock('../lib/webPush', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/webPush')>()),
  detachWebPush: vi.fn(async () => {}),
}))
vi.mock('../hooks/useAutoBackup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../hooks/useAutoBackup')>()),
  backupNow: vi.fn(async () => true),
}))

const { AuthProvider } = await import('./AuthContext')
const { backupNow } = await import('../hooks/useAutoBackup')

beforeEach(() => {
  sb.gone = false
  sb.getUser.mockReset()
  sb.getUser.mockImplementation(async (jwt?: string) =>
    sb.gone
      ? { data: { user: null }, error: { status: 403, code: 'user_not_found', message: 'User from sub claim in JWT does not exist' } }
      : { data: { user: { id: 'u1' } }, error: null, jwt },
  )
  vi.mocked(backupNow).mockClear()
})

async function signedInThenSignedOut() {
  render(
    <AuthProvider>
      <div />
    </AuthProvider>,
  )
  await act(async () => {})
  useTaskStore.getState().addTask('u1 task')
  useTaskStore.getState().setDataOwner('u1')
  await act(async () => {
    sb.listener!('SIGNED_OUT', null)
    await new Promise((r) => setTimeout(r, 0))
  })
}

describe('SIGNED_OUT の片付け', () => {
  it('アカウントがもう無ければ（別の端末で消された）、控えを取らずに消す', async () => {
    sb.gone = true
    await signedInThenSignedOut()

    expect(sb.getUser).toHaveBeenCalledWith('token-u1')
    expect(useTaskStore.getState().tasks).toEqual([])
    expect(backupNow).not.toHaveBeenCalledWith('beforeSignOut', expect.anything())
  })

  it('アカウントがあれば、これまでどおり控えを取ってから消す', async () => {
    await signedInThenSignedOut()

    expect(useTaskStore.getState().tasks).toEqual([])
    expect(backupNow).toHaveBeenCalledWith('beforeSignOut', 'u1')
  })
})

describe('自分でログアウトしていないときは理由を覚える（#468）', () => {
  beforeEach(() => localStorage.clear())
  const notice = () =>
    JSON.parse(localStorage.getItem('chronograma.signedOutNotice') ?? 'null') as { reason: string; userId: string } | null

  it('期限切れ・ほかで取り消された', async () => {
    await signedInThenSignedOut()
    expect(notice()).toMatchObject({ reason: 'expired', userId: 'u1' })
  })

  it('別の端末でアカウントが削除された', async () => {
    sb.gone = true
    await signedInThenSignedOut()
    expect(notice()).toMatchObject({ reason: 'deleted', userId: 'u1' })
  })

  it('自分でログアウトした（ほかのタブで、を含む）なら覚えない', async () => {
    const { noteUserSignOut } = await import('../lib/signedOutNotice')
    noteUserSignOut()
    await signedInThenSignedOut()
    expect(notice()).toBeNull()
  })
})
