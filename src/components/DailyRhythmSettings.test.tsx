import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DailyRhythmSettings } from './DailyRhythmSettings'
import { useTaskStore } from '../store/taskStore'
import { TASK_DEFAULTS } from '../lib/taskDefaults'
import { toDateKey } from '../lib/dateKey'
import { zonedNow } from '../lib/timeZone'
import type { Task } from '../types/task'

const env = vi.hoisted(() => ({ ios: false, standalone: false }))
vi.mock('../lib/pwa', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/pwa')>()),
  isIos: () => env.ios,
  isStandalone: () => env.standalone,
}))

const NEED_INSTALL = 'Add to your Home Screen to use notifications'
const UNSUPPORTED = 'This browser does not support notifications.'
const WRAP_UP = "Evening wrap-up (today's numbers)"

const hadNotification = 'Notification' in window
const originalNotification = (window as { Notification?: unknown }).Notification

function withoutNotification() {
  delete (window as { Notification?: unknown }).Notification
}

beforeEach(() => {
  env.ios = false
  env.standalone = false
})

afterEach(() => {
  if (hadNotification) (window as { Notification?: unknown }).Notification = originalNotification
  else delete (window as { Notification?: unknown }).Notification
})

describe('設定「通知」で通知が使えないとき', () => {
  it('iPhone の Safari（ホーム画面に未追加）では「対応していません」ではなく、追加すれば使えると案内し、アプリの行へ飛べる', async () => {
    withoutNotification()
    env.ios = true
    const target = document.createElement('section')
    target.id = 'settings-app'
    const scrollIntoView = vi.fn()
    target.scrollIntoView = scrollIntoView
    document.body.appendChild(target)
    try {
      render(<DailyRhythmSettings />)
      expect(screen.queryByText(UNSUPPORTED)).toBeNull()
      await userEvent.setup().click(screen.getByRole('button', { name: new RegExp(NEED_INSTALL) }))
      expect(scrollIntoView).toHaveBeenCalled()
      // 追加するまでは押せないまま
      expect(screen.getByRole('switch', { name: 'Morning summary' })).toBeDisabled()
      expect(screen.getByRole('switch', { name: WRAP_UP })).toBeDisabled()
    } finally {
      target.remove()
    }
  })

  it('通知の無いほかのブラウザでは今の文言のまま', () => {
    withoutNotification()
    render(<DailyRhythmSettings />)
    expect(screen.getByText(UNSUPPORTED)).toBeInTheDocument()
    expect(screen.queryByText(NEED_INSTALL)).toBeNull()
  })

  it('iPhone でもホーム画面から開いて通知が使えるなら案内は出さない', () => {
    env.ios = true
    env.standalone = true
    ;(window as { Notification?: unknown }).Notification = { permission: 'default' }
    render(<DailyRhythmSettings />)
    expect(screen.queryByText(NEED_INSTALL)).toBeNull()
    expect(screen.queryByText(UNSUPPORTED)).toBeNull()
  })
})

describe('設定「通知」の夜の締め', () => {
  it('既定はオフ。オンにすると 22:00 になり、時刻を変えられる。オフに戻せる', async () => {
    ;(window as { Notification?: unknown }).Notification = {
      permission: 'granted',
      requestPermission: async () => 'granted',
    }
    const user = userEvent.setup()
    render(<DailyRhythmSettings />)
    const toggle = screen.getByRole('switch', { name: WRAP_UP })
    expect(toggle).not.toBeChecked()
    await user.click(toggle)
    expect(useTaskStore.getState().dailyReminders.wrapUpTime).toBe('22:00')
    const time = screen.getByLabelText(WRAP_UP, { selector: 'input' })
    expect(time).toHaveValue('22:00')
    fireEvent.change(time, { target: { value: '21:15' } })
    expect(useTaskStore.getState().dailyReminders).toEqual({ planTime: null, wrapUpTime: '21:15' })
    await user.click(screen.getByRole('switch', { name: WRAP_UP }))
    expect(useTaskStore.getState().dailyReminders.wrapUpTime).toBeNull()
  })
})

describe('設定「計画」の 1 日に計画する時間の目安（#275）', () => {
  it('直近 2 週の、記録のある日の平均を添える。記録が無ければ出さない', () => {
    useTaskStore.setState({ tasks: [] })
    const { unmount } = render(<DailyRhythmSettings />)
    expect(screen.queryByText(/Last 2 weeks/)).toBeNull()
    unmount()

    const yesterday = zonedNow()
    yesterday.setDate(yesterday.getDate() - 1)
    const log = {
      ...TASK_DEFAULTS,
      id: 'l',
      title: 'Study',
      kind: 'log',
      description: '',
      completed: true,
      completedAt: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      order: 0,
      listId: 'inbox',
      sectionId: null,
      parentId: null,
      priority: 'none',
      tags: [],
      recurrence: null,
      dueDate: toDateKey(yesterday),
      startTime: '09:00',
      endTime: '12:30',
    } as Task
    useTaskStore.setState({ tasks: [log] })
    render(<DailyRhythmSettings />)
    expect(screen.getByText('Last 2 weeks: 3h 30m logged on average on days with records (1 day)')).toBeInTheDocument()
  })
})
