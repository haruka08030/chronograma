import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

vi.mock('../../lib/errorReport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/errorReport')>()),
  reportError: vi.fn(),
}))
vi.mock('../../lib/crashRecovery', () => ({
  downloadRawData: vi.fn(),
  latestAutoBackup: vi.fn(() => Promise.reject(new Error('idb closed'))),
}))

let broken = true
function Screen() {
  if (broken) throw new Error('boom')
  return <p>screen</p>
}

beforeEach(() => {
  broken = true
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('ErrorBoundary', () => {
  it('画面のエラーには常に「もう一度」。今日の画面にいるとき（onLeave なし）は「今日を開く」を出さない', () => {
    render(
      <ErrorBoundary scope="screen">
        <Screen />
      </ErrorBoundary>,
    )
    expect(screen.queryByRole('button', { name: 'Go to Today' })).toBeNull()
    broken = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.getByText('screen')).toBeInTheDocument()
  })

  it('ほかの画面では「今日を開く」も出す', () => {
    const onLeave = vi.fn()
    render(
      <ErrorBoundary scope="screen" onLeave={onLeave}>
        <Screen />
      </ErrorBoundary>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Go to Today' }))
    expect(onLeave).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('自動バックアップから戻せなかったら、理由を出す（無言にしない）', async () => {
    render(
      <ErrorBoundary scope="app">
        <Screen />
      </ErrorBoundary>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Restore auto-backup' }))
    expect(await screen.findByText("Couldn't restore. Export your data, then reload.")).toBeInTheDocument()
  })
})
