import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CanvasStatus } from '../../lib/canvas'

const api = vi.hoisted(() => ({
  status: { connections: [] } as CanvasStatus,
  connectFeed: vi.fn(),
  // 描画のたびに別のものだと、状態の読み直しが走る
  user: { id: 'u1' },
}))

vi.mock('../../lib/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/supabase')>()),
  isSupabaseConfigured: true,
}))
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: api.user }) }))
vi.mock('../../lib/canvas', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/canvas')>()),
  fetchCanvasStatus: async () => api.status,
  connectCanvasFeed: (url: string) => api.connectFeed(url),
}))

const { CanvasSettings } = await import('./CanvasSettings')

const TOKEN = '3f2a9c0d1e4b5a6978c0d1e2f3a4b5c6'
const MOODLE_URL = `https://moodle.example.ac.jp/calendar/export_execute.php?userid=12&authtoken=${TOKEN}&preset_what=all&preset_time=recentupcoming`

beforeEach(() => {
  api.status = { connections: [] }
  api.connectFeed.mockReset()
})

describe('学校の LMS の連携（#310）', () => {
  it('Moodle を選ぶと書き出しの URL を貼ってつなげる', async () => {
    const user = userEvent.setup()
    api.connectFeed.mockResolvedValue({
      connections: [{ id: 'moodle.example.ac.jp', kind: 'ical', lms: 'moodle', baseUrl: 'https://moodle.example.ac.jp', userName: null }],
    })
    render(<CanvasSettings />)
    await user.click(await screen.findByRole('radio', { name: 'Moodle' }))
    // Canvas のつなぎ方（トークン・フィード）の選択は Moodle には出さない
    expect(screen.queryByRole('radio', { name: 'Access token' })).toBeNull()
    const input = screen.getByRole('textbox', { name: 'Calendar export URL' })
    const connect = screen.getByRole('button', { name: 'Connect' })

    // 書き出しの画面の URL は分けて案内する
    await user.type(input, 'https://moodle.example.ac.jp/calendar/export.php')
    expect(screen.getByText(/This is a Moodle calendar page/)).toBeInTheDocument()
    expect(connect).toBeDisabled()

    await user.clear(input)
    await user.click(input)
    await user.paste(MOODLE_URL)
    expect(connect).toBeEnabled()
    await user.click(connect)
    expect(api.connectFeed).toHaveBeenCalledWith(MOODLE_URL)
    expect(await screen.findByText('Moodle calendar (read-only)')).toBeInTheDocument()
  })
})
