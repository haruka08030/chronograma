import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const status = vi.hoisted(() => ({ notion: false, canvas: 0 }))

vi.mock('../../lib/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/supabase')>()),
  isSupabaseConfigured: true,
}))
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('../../lib/notion', () => ({ fetchNotionStatus: async () => ({ connected: status.notion }) }))
vi.mock('../../lib/canvas', () => ({
  fetchCanvasStatus: async () => ({ connections: Array.from({ length: status.canvas }, (_, i) => ({ id: String(i) })) }),
}))
vi.mock('./NotionSettings', () => ({ NotionSettings: () => <p>Notion settings</p> }))
vi.mock('./CanvasSettings', () => ({ CanvasSettings: () => <p>Canvas settings</p> }))

const { MoreIntegrations } = await import('./MoreIntegrations')

beforeEach(() => {
  status.notion = false
  status.canvas = 0
})

const toggle = () => screen.getByRole('button', { name: 'More integrations' })

describe('その他の連携', () => {
  it('どれもつないでいなければ畳んでおき、押すと Notion と Canvas が出る', async () => {
    const user = userEvent.setup()
    render(<MoreIntegrations />)
    // 状態を読み終えても畳んだまま
    await new Promise((r) => setTimeout(r, 0))
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Notion settings')).toBeNull()

    await user.click(toggle())
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Notion settings')).toBeInTheDocument()
    expect(screen.getByText('Canvas settings')).toBeInTheDocument()
  })

  it('Notion をつないでいれば開いて出す', async () => {
    status.notion = true
    render(<MoreIntegrations />)
    expect(await screen.findByText('Notion settings')).toBeInTheDocument()
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
  })

  it('Canvas をつないでいれば開いて出す', async () => {
    status.canvas = 1
    render(<MoreIntegrations />)
    expect(await screen.findByText('Canvas settings')).toBeInTheDocument()
  })
})
