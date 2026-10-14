import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({
  signInWithOtp: vi.fn(async () => ({})),
  signInWithGoogle: vi.fn(async () => ({})),
  googleAvailable: true,
  user: null as { id: string; email?: string } | null,
}))

vi.mock('../lib/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/supabase')>()),
  isSupabaseConfigured: true,
}))
vi.mock('../lib/googleCalendar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/googleCalendar')>()),
  isGoogleAvailable: () => auth.googleAvailable,
}))
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: auth.user,
    loading: false,
    signInWithOtp: auth.signInWithOtp,
    verifyEmailOtp: vi.fn(async () => ({})),
    signInWithGoogle: auth.signInWithGoogle,
    signOut: vi.fn(),
    deleteAccount: vi.fn(),
  }),
}))

const { AccountMenu } = await import('./AccountMenu')
const { clearPendingEmailCode, pendingEmailCode, savePendingEmailCode } = await import('../lib/pendingEmailCode')

beforeEach(() => {
  auth.googleAvailable = true
  auth.user = null
  auth.signInWithOtp.mockClear()
  auth.signInWithGoogle.mockClear()
  clearPendingEmailCode('signIn')
  clearPendingEmailCode('reauth')
})

async function openSignIn() {
  const user = userEvent.setup()
  render(<AccountMenu />)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  return user
}

describe('ログインの画面', () => {
  it('Google が主のボタンで、メールの欄は押すまで出さない', async () => {
    const user = await openSignIn()
    const google = screen.getByRole('button', { name: 'Sign in with Google' })
    expect(screen.queryByPlaceholderText('Email')).toBeNull()

    await user.click(google)
    expect(auth.signInWithGoogle).toHaveBeenCalledOnce()
  })

  it('「メールでログイン」を押すと欄が出て、メールでも送れる', async () => {
    const user = await openSignIn()
    await user.click(screen.getByRole('button', { name: 'Sign in with email' }))
    const input = screen.getByPlaceholderText('Email')
    expect(input).toHaveFocus()
    await user.type(input, 'a@example.com')
    await user.click(screen.getByRole('button', { name: 'Send link' }))
    expect(auth.signInWithOtp).toHaveBeenCalledWith('a@example.com')
    // コードの欄に進む
    expect(await screen.findByPlaceholderText('Code from email')).toBeInTheDocument()
  })

  it('Google が使えないときはメールの欄を最初から出す', async () => {
    auth.googleAvailable = false
    await openSignIn()
    expect(screen.queryByRole('button', { name: 'Sign in with Google' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Sign in with email' })).toBeNull()
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument()
  })

  it('コードを送ると端末に残し、すぐ送り直せないことを残り秒数で示す', async () => {
    const user = await openSignIn()
    await user.click(screen.getByRole('button', { name: 'Sign in with email' }))
    await user.type(screen.getByPlaceholderText('Email'), 'a@example.com')
    await user.click(screen.getByRole('button', { name: 'Send link' }))
    expect(await screen.findByPlaceholderText('Code from email')).toHaveFocus()
    expect(pendingEmailCode('signIn')?.email).toBe('a@example.com')
    expect(screen.getByRole('button', { name: /^Resend code \(\d+s\)$/ })).toBeDisabled()
  })

  it('コードを送ったまま閉じられて開き直すと、コードの欄から始まり、送り直せる', async () => {
    savePendingEmailCode('signIn', 'a@example.com', Date.now() - 2 * 60 * 1000)
    const user = userEvent.setup()
    render(<AccountMenu />)
    expect(screen.getByPlaceholderText('Code from email')).toBeInTheDocument()
    expect(screen.getByText('a@example.com')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Resend code' }))
    expect(auth.signInWithOtp).toHaveBeenCalledWith('a@example.com')
  })

  it('欄を自分で閉じたら、開き直しても連れ戻さないが、開けばコードを打てる', async () => {
    savePendingEmailCode('signIn', 'a@example.com')
    const user = userEvent.setup()
    render(<AccountMenu />)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.queryByPlaceholderText('Code from email')).toBeNull()

    cleanup()
    render(<AccountMenu />)
    expect(screen.queryByPlaceholderText('Code from email')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.getByPlaceholderText('Code from email')).toBeInTheDocument()
  })

  it('コードを待つ間は外を押しても閉じず、「ログイン」を押すと閉じる', async () => {
    savePendingEmailCode('signIn', 'a@example.com')
    const user = userEvent.setup()
    render(<AccountMenu />)
    await user.click(document.body)
    await user.keyboard('{Escape}')
    expect(screen.getByPlaceholderText('Code from email')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.queryByPlaceholderText('Code from email')).toBeNull()
  })

  it('メールアドレスを変えると、開き直してもコードの欄に戻らない', async () => {
    savePendingEmailCode('signIn', 'a@example.com')
    const user = userEvent.setup()
    render(<AccountMenu />)
    await user.click(screen.getByRole('button', { name: 'Use a different email' }))
    expect(pendingEmailCode('signIn')).toBeNull()
  })
})

describe('削除の前の本人確認', () => {
  it('コードを送ったまま閉じられて開き直すと、コードの欄に戻る', () => {
    auth.user = { id: 'u1', email: 'a@example.com' }
    savePendingEmailCode('reauth', 'a@example.com', Date.now() - 2 * 60 * 1000)
    render(<AccountMenu />)
    expect(screen.getByPlaceholderText('Code from email')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resend code' })).toBeEnabled()
  })

  it('別のアカウントで送ったコードには戻らない', () => {
    auth.user = { id: 'u2', email: 'b@example.com' }
    savePendingEmailCode('reauth', 'a@example.com')
    render(<AccountMenu />)
    expect(screen.queryByPlaceholderText('Code from email')).toBeNull()
    expect(pendingEmailCode('reauth')).toBeNull()
  })
})
