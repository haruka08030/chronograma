import { act, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../../store/taskStore'
import { makeTask } from '../../store/taskHelpers'
import { INBOX_LIST_ID } from '../../store/storeConstants'
import { isLogTask, type Task } from '../../types/task'
import { TodayPlannerView } from '../TodayPlannerView'

/** 1 日の締めで記録の無い時間を埋める（#418） */

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
  vi.setSystemTime(new Date(2026, 9, 8, 21, 0, 0))
  useTaskStore.getState().setSelectedCalendarDateKey(DAY)
  localStorage.removeItem('chronograma-wrapup-idle-v1')
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

/** 朝 8〜9 時に読書、12〜13 時に昼ごはん。抜けは 9〜12 時と 13〜21 時（今） */
function seed() {
  useTaskStore.setState({ tasks: [log('Reading', '08:00', '09:00'), log('Lunch', '12:00', '13:00')], activeTimer: null })
}

const gapRows = () => screen.queryAllByRole('listitem').filter((li) => li.hasAttribute('data-wrap-up-gap'))
const logsAt = (start: string) => useTaskStore.getState().tasks.filter((t) => isLogTask(t) && t.startTime === start && t.dueDate === DAY)

describe('1 日の締めの記録の無い時間', () => {
  it('締めの時刻を過ぎると、記録の無い時間が時刻の順に並ぶ', () => {
    seed()
    render(<TodayPlannerView />)
    expect(screen.getByRole('heading', { name: 'Time without records' })).toBeInTheDocument()
    expect(gapRows().map((li) => li.getAttribute('data-wrap-up-gap'))).toEqual(['540-720', '780-1260'])
  })

  it('締めの時刻より前には出さない', () => {
    vi.setSystemTime(new Date(2026, 9, 8, 15, 0, 0))
    seed()
    render(<TodayPlannerView />)
    expect(screen.queryByRole('heading', { name: 'Time without records' })).toBeNull()
  })

  it('最近の記録を押すと、その時間・題名で記録ができて行が消える', () => {
    seed()
    render(<TodayPlannerView />)
    act(() => screen.getByRole('button', { name: 'Record 09:00–12:00 as “Reading”' }).click())
    const made = logsAt('09:00')
    expect(made).toHaveLength(1)
    expect(made[0]).toMatchObject({ title: 'Reading', endTime: '12:00' })
    expect(gapRows().map((li) => li.getAttribute('data-wrap-up-gap'))).toEqual(['780-1260'])
  })

  it('「何もしていない」は記録を作らず、その日の締めに出さない（開き直しても）', () => {
    seed()
    const view = render(<TodayPlannerView />)
    const row = gapRows()[0]!
    act(() => within(row).getByRole('button', { name: 'Nothing' }).click())
    expect(logsAt('09:00')).toHaveLength(0)
    expect(gapRows().map((li) => li.getAttribute('data-wrap-up-gap'))).toEqual(['780-1260'])
    view.unmount()
    render(<TodayPlannerView />)
    expect(gapRows().map((li) => li.getAttribute('data-wrap-up-gap'))).toEqual(['780-1260'])
  })

  it('「ほかを記録」は、その時間を入れた後から記録を開く', () => {
    seed()
    render(<TodayPlannerView />)
    act(() => within(gapRows()[0]!).getByRole('button', { name: 'Record something else' }).click())
    expect(screen.getByDisplayValue('09:00')).toBeInTheDocument()
    expect(screen.getByDisplayValue('12:00')).toBeInTheDocument()
  })

  it('抜けの無い日は何も増えない', () => {
    useTaskStore.setState({ tasks: [log('Work', '08:00', '21:00')], activeTimer: null })
    render(<TodayPlannerView />)
    expect(screen.queryByRole('heading', { name: 'Time without records' })).toBeNull()
  })
})
