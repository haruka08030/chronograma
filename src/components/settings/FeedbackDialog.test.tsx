import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../../store/taskStore'

const state = vi.hoisted(() => ({
  user: { id: 'u1' } as { id: string } | null,
  insert: vi.fn<(row: unknown) => Promise<{ error: { message: string } | null }>>(async () => ({ error: null })),
}))

vi.mock('../../lib/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/supabase')>()),
  isSupabaseConfigured: true,
  getSupabase: () => ({ from: (table: string) => (table === 'feedback' ? { insert: state.insert } : null) }),
}))
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: state.user }) }))

const { FeedbackRow } = await import('./FeedbackDialog')

beforeEach(() => {
  state.user = { id: 'u1' }
  state.insert.mockReset()
  state.insert.mockResolvedValue({ error: null })
})

async function open() {
  const user = userEvent.setup()
  render(<FeedbackRow />)
  await user.click(screen.getByRole('button', { name: 'Contact & feedback' }))
  return user
}

describe('お問い合わせ・フィードバック', () => {
  it('書いて送ると feedback に入り、閉じて知らせる', async () => {
    const user = await open()
    const send = screen.getByRole('button', { name: 'Send' })
    expect(send).toBeDisabled()
    const field = screen.getByRole('textbox', { name: 'Contact & feedback' })
    expect(field).toHaveFocus()
    await user.type(field, '  The timer stops  ')
    await user.click(send)

    expect(state.insert).toHaveBeenCalledOnce()
    expect(state.insert.mock.calls[0]?.[0]).toMatchObject({ message: 'The timer stops' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(useTaskStore.getState().moveBannerText).toBe('Sent. Thank you')
  })

  it('送れなければ書いたものを残して理由を出す（送りすぎ）', async () => {
    state.insert.mockResolvedValue({ error: { message: 'feedback_rate_limited' } })
    const user = await open()
    await user.type(screen.getByRole('textbox', { name: 'Contact & feedback' }), 'hello')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(screen.getByRole('alert')).toHaveTextContent('You cannot send more today')
    expect(screen.getByRole('textbox', { name: 'Contact & feedback' })).toHaveValue('hello')
  })

  it('ログインしていなければ欄を出さず、ログインすると送れると伝える', async () => {
    state.user = null
    await open()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByRole('dialog')).toHaveTextContent('Sign in to send')
  })
})
