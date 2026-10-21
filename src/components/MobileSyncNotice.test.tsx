import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../store/taskStore'

/** スマホでも同期の問題が見える（#467） */
vi.mock('../contexts/AuthContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../contexts/AuthContext')>()),
  useAuth: () => ({ user: { id: 'u1' } }),
}))
const { MobileSyncNotice } = await import('./MobileSyncNotice')

beforeEach(() => {
  vi.useFakeTimers()
  useTaskStore.setState({ syncState: 'idle', syncRejected: [], lastSyncedAt: null })
})
afterEach(() => vi.useRealTimers())

describe('MobileSyncNotice', () => {
  it('同期できているときは何も出さない', () => {
    render(<MobileSyncNotice />)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('上限に達したら、すぐに説明の文で出す（乗せなくても読める）', () => {
    useTaskStore.setState({ syncState: 'limit' })
    render(<MobileSyncNotice />)
    expect(screen.getByRole('status').textContent).toMatch(/上限|maximum/i)
  })

  it('未同期は 30 秒続いたら出す（回線が一瞬切れただけでは出さない）', () => {
    useTaskStore.setState({ syncState: 'error' })
    render(<MobileSyncNotice />)
    expect(screen.queryByRole('status')).toBeNull()
    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    expect(screen.getByRole('status')).toBeTruthy()
    // つながったら消える
    act(() => {
      useTaskStore.setState({ syncState: 'idle' })
    })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('古い版なら、読み込み直すボタンも出す', () => {
    useTaskStore.setState({ syncState: 'outdated' })
    render(<MobileSyncNotice />)
    expect(screen.getByRole('button')).toBeTruthy()
  })
})
