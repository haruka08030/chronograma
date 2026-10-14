import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({
  signInWithOtp: vi.fn(async () => ({})),
  signInWithGoogle: vi.fn(async () => ({})),
  googleAvailable: true,
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
    user: null,
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
  auth.signInWithOtp.mockClear()
  auth.signInWithGoogle.mockClear()
  clearPendingEmailCode()
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

  it('コードを送ったままアプリを閉じて開き直すと、コードの欄から始まる', async () => {
    const first = await openSignIn()
    await first.click(screen.getByRole('button', { name: 'Sign in with email' }))
    await first.type(screen.getByPlaceholderText('Email'), 'a@example.com')
    await first.click(screen.getByRole('button', { name: 'Send link' }))
    await screen.findByPlaceholderText('Code from email')
    expect(pendingEmailCode()).toBe('a@example.com')

    // 開き直す（画面の中の状態は消える）
    cleanup()
    render(<AccountMenu />)
    expect(screen.getByPlaceholderText('Code from email')).toBeInTheDocument()
    expect(screen.getByText('a@example.com')).toBeInTheDocument()
  })

  it('メールアドレスを変えると、開き直してもコードの欄に戻らない', async () => {
    savePendingEmailCode('a@example.com')
    const user = userEvent.setup()
    render(<AccountMenu />)
    await user.click(screen.getByRole('button', { name: 'Use a different email' }))
    expect(pendingEmailCode()).toBeNull()
  })
})
