import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../store/taskStore'

/** 自分でログアウトしていないのにログアウトしたときの知らせ（#468） */
const env = vi.hoisted(() => ({ user: null as { id: string } | null }))
vi.mock('../contexts/AuthContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../contexts/AuthContext')>()),
  useAuth: () => ({ user: env.user }),
}))
vi.mock('../lib/autoBackup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/autoBackup')>()),
  listAutoBackups: vi.fn(async () => [
    {
      id: 'b1',
      kind: 'beforeSignOut',
      savedAt: new Date(Date.now()).toISOString(),
      dateKey: '2026-10-20',
      todoCount: 1,
      logCount: 0,
      owner: 'u1',
    },
  ]),
  loadAutoBackup: vi.fn(async () => ({ json: '{}' })),
}))
const { SignedOutNotice } = await import('./SignedOutNotice')
const { noteSignedOut } = await import('../lib/signedOutNotice')

beforeEach(() => {
  localStorage.clear()
  env.user = null
  useTaskStore.setState({ cloudPulledAt: null, lastSyncedAt: null })
})

describe('SignedOutNotice', () => {
  it('ログアウトしている間は理由と「ログインする」を出し、× で閉じられる', () => {
    act(() => {
      noteSignedOut('expired', 'u1')
    })
    render(<SignedOutNotice />)
    expect(screen.getByRole('status').textContent).toMatch(/expired/i)
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('同じ人がログインし直し、クラウドの内容を取り込んだら、控えから戻すかを聞く', async () => {
    act(() => {
      noteSignedOut('expired', 'u1')
    })
    env.user = { id: 'u1' }
    const restore = vi.fn(() => 2)
    useTaskStore.setState({ restoreMissingFromBackup: restore })
    const { rerender } = render(<SignedOutNotice />)
    expect(screen.queryByRole('status')).toBeNull()
    act(() => {
      useTaskStore.setState({ cloudPulledAt: new Date().toISOString() })
    })
    rerender(<SignedOutNotice />)
    await act(async () => {})
    fireEvent.click(await screen.findByRole('button', { name: /bring back/i }))
    await act(async () => {})
    expect(restore).toHaveBeenCalledWith('{}')
    expect(localStorage.getItem('chronograma.signedOutNotice')).toBeNull()
  })

  it('別の人がログインしたら、前の人の知らせは消す', async () => {
    act(() => {
      noteSignedOut('expired', 'u1')
    })
    env.user = { id: 'u2' }
    render(<SignedOutNotice />)
    await act(async () => {})
    expect(localStorage.getItem('chronograma.signedOutNotice')).toBeNull()
  })
})
