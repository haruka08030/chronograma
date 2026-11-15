import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { UNDO_WINDOW_MS } from '../lib/undoWindow'
import { UndoToast } from './UndoToast'

beforeEach(() => {
  vi.useFakeTimers()
  useTaskStore.setState({ recentDeletes: [], googleUndo: null, undoBanner: { text: 'Moved', at: Date.now() } })
})
afterEach(() => {
  useTaskStore.setState({ undoBanner: null })
  vi.useRealTimers()
})

const flush = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}

describe('元に戻すのトースト（#718）', () => {
  it('マウスを乗せている間は消さず、離れてから 5 秒で消す', async () => {
    render(<UndoToast />)
    await flush(0)
    const toast = screen.getByRole('status')
    fireEvent.mouseEnter(toast)
    await flush(UNDO_WINDOW_MS * 3)
    expect(useTaskStore.getState().undoBanner).not.toBeNull()
    fireEvent.mouseLeave(toast)
    await flush(UNDO_WINDOW_MS - 100)
    expect(useTaskStore.getState().undoBanner).not.toBeNull()
    await flush(200)
    expect(useTaskStore.getState().undoBanner).toBeNull()
  })

  it('乗せなければ 5 秒で消す', async () => {
    render(<UndoToast />)
    await flush(UNDO_WINDOW_MS + 10)
    expect(useTaskStore.getState().undoBanner).toBeNull()
  })
})
