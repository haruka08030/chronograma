import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerIntegrationWrites } from '../../lib/integrationWrites'
import { writeBackQueue } from '../../lib/writeBackQueue'
import { IntegrationPendingRow } from './IntegrationPendingRow'

/** 連携に送れずに待っている変更を、捨てる前に設定で見て送り直せる（#716） */
const stops: Array<() => void> = []
afterEach(() => {
  stops.splice(0).forEach((s) => s())
  localStorage.clear()
})

describe('IntegrationPendingRow', () => {
  it('待っているものが無ければ出さない', () => {
    stops.push(registerIntegrationWrites('notion', { flush: async () => {}, count: () => 0 }))
    const { container } = render(<IntegrationPendingRow name="notion" />)
    expect(container.textContent).toBe('')
  })

  it('件数と「今すぐ送る」を出し、送り待ちが減れば件数も変わる', async () => {
    const queue = writeBackQueue<{ x: number }>('chronograma-writeback-v1:notion:test')
    queue.put('a', { x: 1 })
    queue.put('b', { x: 2 })
    const flush = vi.fn(async () => queue.done('a'))
    stops.push(registerIntegrationWrites('notion', { flush, count: () => queue.all().length }))
    render(<IntegrationPendingRow name="notion" />)
    expect(screen.getByText(/2/).textContent).toMatch(/Notion/)
    await act(async () => {
      screen.getByRole('button', { name: /今すぐ送る|Send now/ }).click()
      await Promise.resolve()
    })
    expect(flush).toHaveBeenCalledOnce()
    expect(screen.getByText(/Notion/).textContent).toMatch(/1/)
  })
})
