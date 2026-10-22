import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../../store/taskStore'
import { TodayPlannerView } from '../TodayPlannerView'

/** 日を移っても睡眠の行は 1 つだけ（気分の記号と key が重なると、前の日の行が残って増えていった） */

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {}
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  globalThis.IntersectionObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  } as unknown as typeof IntersectionObserver
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 8, 13, 0, 0))
  useTaskStore.setState({ tasks: [], onboardingDone: true, sleepTimer: null })
  useTaskStore.getState().setSelectedCalendarDateKey('2026-10-08')
})
afterEach(() => vi.useRealTimers())

describe('今日の画面の睡眠の行', () => {
  it('前の日へ何度移っても 1 つだけ', () => {
    render(<TodayPlannerView />)
    for (const day of ['2026-10-07', '2026-10-06', '2026-10-05', '2026-10-06', '2026-10-08']) {
      act(() => useTaskStore.getState().setSelectedCalendarDateKey(day))
      expect(screen.getAllByText('Went to bed')).toHaveLength(1)
    }
  })
})
