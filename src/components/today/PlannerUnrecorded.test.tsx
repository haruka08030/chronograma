import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../../store/taskStore'
import { makeTask } from '../../store/taskHelpers'
import { INBOX_LIST_ID } from '../../store/storeConstants'
import type { Task } from '../../types/task'
import { TodayPlannerView } from '../TodayPlannerView'

/** 見出しの「記録なし」を押すと「後から記録」を直前の記録の終わり〜今で開く（#393） */

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

const DAY = '2026-10-08'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 8, 13, 0, 0))
  useTaskStore.getState().setSelectedCalendarDateKey(DAY)
})
afterEach(() => vi.useRealTimers())

const log = (id: string, startTime: string, endTime: string, over: Partial<Task> = {}): Task => ({
  ...makeTask({ title: id, listId: INBOX_LIST_ID }, 0),
  id,
  kind: 'log',
  dueDate: DAY,
  startTime,
  endTime,
  completed: true,
  ...over,
})

describe('見出しの「記録なし」', () => {
  it('押すと後から記録を直前の記録の終わり〜今で開く', () => {
    useTaskStore.setState({ tasks: [log('読書', '09:00', '10:30')], activeTimer: null })
    render(<TodayPlannerView />)
    const button = screen.getByRole('button', { name: /unrecorded/ })
    act(() => button.click())
    expect(screen.getByDisplayValue('10:30')).toBeInTheDocument()
    expect(screen.getByDisplayValue('13:00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Log' })).toBeEnabled()
  })

  it('朝は夜から続いた睡眠の終わりから', () => {
    vi.setSystemTime(new Date(2026, 9, 8, 9, 0, 0))
    useTaskStore.setState({
      tasks: [log('睡眠', '23:30', '07:00', { kind: 'sleep', dueDate: '2026-10-07', endDate: DAY })],
      activeTimer: null,
      onboardingDone: true,
    })
    render(<TodayPlannerView />)
    act(() => screen.getByRole('button', { name: /unrecorded/ }).click())
    expect(screen.getByDisplayValue('07:00')).toBeInTheDocument()
    expect(screen.getByDisplayValue('09:00')).toBeInTheDocument()
  })
})
