import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ user: null as { id: string } | null }))
const loaded = vi.hoisted(() => ({ count: 0 }))

vi.mock('../contexts/AuthContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../contexts/AuthContext')>()),
  useAuth: () => ({ user: auth.user, loading: false }),
}))
// 本物の同期は動かさず、読まれたか・描かれたかだけを見る
vi.mock('./AccountSync', () => {
  loaded.count += 1
  return { AccountSync: () => <p>sync running</p> }
})
const { AccountSyncLoader } = await import('./AccountSyncLoader')

describe('AccountSyncLoader', () => {
  it('ログインしていなければ同期の部品を読まず、ログインしたら読んで描き、ログアウトしても描いたまま', async () => {
    const { rerender } = render(<AccountSyncLoader />)
    await new Promise((r) => setTimeout(r, 20))
    expect(loaded.count).toBe(0)
    expect(screen.queryByText('sync running')).toBeNull()

    auth.user = { id: 'u1' }
    rerender(<AccountSyncLoader />)
    expect(await screen.findByText('sync running')).toBeTruthy()
    expect(loaded.count).toBe(1)

    // ログアウトの片付け（同期の表示を戻すなど）は同じ部品がするので、外さない
    auth.user = null
    rerender(<AccountSyncLoader />)
    expect(screen.getByText('sync running')).toBeTruthy()
  })
})
