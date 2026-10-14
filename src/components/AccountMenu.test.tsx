import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({
  signInWithOtp: vi.fn(async () => ({})),
  signInWithGoogle: vi.fn(async () => ({})),
  signInWithPasskey: vi.fn(async (): Promise<{ error?: string; failure?: string }> => ({})),
  googleAvailable: true,
  passkeyAvailable: false,
}))

vi.mock('../lib/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/supabase')>()),
  isSupabaseConfigured: true,
}))
vi.mock('../lib/googleCalendar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/googleCalendar')>()),
  isGoogleAvailable: () => auth.googleAvailable,
}))
vi.mock('../lib/passkey', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/passkey')>()),
  isPasskeySupported: () => auth.passkeyAvailable,
}))
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    signInWithOtp: auth.signInWithOtp,
    verifyEmailOtp: vi.fn(async () => ({})),
    signInWithGoogle: auth.signInWithGoogle,
    signInWithPasskey: auth.signInWithPasskey,
    signOut: vi.fn(),
    deleteAccount: vi.fn(),
  }),
}))

const { AccountMenu } = await import('./AccountMenu')

beforeEach(() => {
  auth.googleAvailable = true
  auth.passkeyAvailable = false
  auth.signInWithPasskey.mockReset()
  auth.signInWithPasskey.mockResolvedValue({})
  auth.signInWithOtp.mockClear()
  auth.signInWithGoogle.mockClear()
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
    await user.click(screen.getByRole('button', { name: 'Send code' }))
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

  it('パスキーが使える端末ではパスキーが最初のボタンで、押すとその場でログインする', async () => {
    auth.passkeyAvailable = true
    const user = await openSignIn()
    const buttons = screen.getAllByRole('button').map((b) => b.textContent)
    expect(buttons.indexOf('Sign in with a passkey')).toBeLessThan(buttons.indexOf('Sign in with Google'))
    await user.click(screen.getByRole('button', { name: 'Sign in with a passkey' }))
    expect(auth.signInWithPasskey).toHaveBeenCalledOnce()
    // 成功したら閉じる
    expect(screen.queryByRole('button', { name: 'Sign in with a passkey' })).toBeNull()
  })

  it('パスキーの画面を閉じただけなら、エラーを出さずに開いたまま', async () => {
    auth.passkeyAvailable = true
    auth.signInWithPasskey.mockResolvedValue({ failure: 'cancelled' })
    const user = await openSignIn()
    await user.click(screen.getByRole('button', { name: 'Sign in with a passkey' }))
    expect(screen.getByRole('button', { name: 'Sign in with a passkey' })).toBeInTheDocument()
    expect(screen.queryByText(/Could not/)).toBeNull()
  })

  it('パスキーが見つからなければ、ほかの方法を案内する', async () => {
    auth.passkeyAvailable = true
    auth.signInWithPasskey.mockResolvedValue({ error: 'No passkey found on this device.', failure: 'notFound' })
    const user = await openSignIn()
    await user.click(screen.getByRole('button', { name: 'Sign in with a passkey' }))
    expect(await screen.findByText('No passkey found on this device.')).toBeInTheDocument()
  })
})
