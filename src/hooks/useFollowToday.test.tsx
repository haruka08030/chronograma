import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { refreshAppClock } from '../lib/appClock'
import { useAppTodayKey, useNow } from './useAppClock'
import { useFollowToday } from './useFollowToday'

const selected = () => useTaskStore.getState().selectedCalendarDateKey

describe('useFollowToday（開いたまま日をまたぐ）', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 6, 23, 59, 0))
    refreshAppClock()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('今日を見ていたら、0 時をまたいだ分の境目で見ている日が新しい今日に進む', () => {
    useTaskStore.getState().setSelectedCalendarDateKey('2026-10-06')
    const { result } = renderHook(() => {
      useFollowToday()
      return useAppTodayKey()
    })
    expect(result.current).toBe('2026-10-06')

    act(() => {
      vi.advanceTimersByTime(2 * 60_000)
    })
    expect(result.current).toBe('2026-10-07')
    expect(selected()).toBe('2026-10-07')
  })

  it('裏に回して朝に戻ったとき（visibilitychange）も進む', () => {
    useTaskStore.getState().setSelectedCalendarDateKey('2026-10-06')
    renderHook(() => useFollowToday())

    // 裏ではタイマーが止まっている: 時計だけ翌朝へ進め、戻ったことを知らせる
    vi.setSystemTime(new Date(2026, 9, 7, 8, 0, 0))
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(selected()).toBe('2026-10-07')
  })

  it('前後の日を自分で選んでいたら動かさない', () => {
    useTaskStore.getState().setSelectedCalendarDateKey('2026-10-10')
    renderHook(() => useFollowToday())
    act(() => {
      vi.advanceTimersByTime(2 * 60_000)
    })
    expect(selected()).toBe('2026-10-10')
  })

  it('今の時刻は分の境目にそろって進む（60 秒のずれを持たない）', () => {
    vi.setSystemTime(new Date(2026, 9, 6, 10, 0, 50))
    refreshAppClock()
    const { result } = renderHook(() => useNow())
    expect(result.current.getMinutes()).toBe(0)
    act(() => {
      vi.advanceTimersByTime(11_000)
    })
    expect(result.current.getMinutes()).toBe(1)
  })
})
