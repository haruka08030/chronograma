import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useTaskStore } from '../store/taskStore'
import { TASK_DEFAULTS } from './taskDefaults'
import { isLogTask, type Task } from '../types/task'
import {
  closeNotifications,
  installNotificationCleanup,
  settledTaskIds,
  taskNotificationTags,
  trackPageNotification,
} from './notificationCleanup'
import { RecordPromptHost } from '../components/RecordPromptHost'

const task = (id: string, over: Partial<Task> = {}): Task =>
  ({
    ...TASK_DEFAULTS,
    id,
    title: id,
    description: '',
    completed: false,
    completedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    order: 0,
    listId: 'inbox',
    sectionId: null,
    parentId: null,
    dueDate: null,
    startTime: null,
    endTime: null,
    priority: 'none',
    tags: [],
    recurrence: null,
    ...over,
  }) as Task

/** 通知センターに出ている通知の偽物（Service Worker の `getNotifications`） */
function stubShownNotifications(tags: string[]) {
  const shown = tags.map((tag) => ({ tag, close: vi.fn() }))
  vi.stubGlobal('navigator', {
    ...navigator,
    serviceWorker: { getRegistration: async () => ({ getNotifications: async () => shown.filter((n) => !n.close.mock.calls.length) }) },
  })
  const closedTags = () => shown.filter((n) => n.close.mock.calls.length > 0).map((n) => n.tag)
  return { closedTags }
}

afterEach(() => vi.unstubAllGlobals())

describe('settledTaskIds', () => {
  const a = task('a', { dueDate: '2026-10-09' })
  const b = task('b', { scheduledDate: '2026-10-09', startTime: '13:00', endTime: '14:00', kind: 'event' })

  it('完了にした・ごみ箱へ移した件', () => {
    expect(settledTaskIds([a, b], [{ ...a, completed: true }, b])).toEqual(['a'])
    expect(settledTaskIds([a, b], [a, { ...b, deletedAt: '2026-10-08T00:00:00Z' }])).toEqual(['b'])
    expect(settledTaskIds([a, b], [{ ...a, title: 'x' }, b])).toEqual([])
  })

  it('無くなった件と、記録が足された元の予定', () => {
    const log = task('log', { kind: 'log', completed: true, sourceTaskId: 'b' })
    expect(settledTaskIds([a, b], [b, log]).sort()).toEqual(['a', 'b'])
  })

  it('起動時の読み込み（前が空）では何も閉じない', () => {
    expect(settledTaskIds([], [{ ...a, completed: true }])).toEqual([])
  })
})

describe('closeNotifications', () => {
  it('指定の tag の通知だけを閉じる', async () => {
    const sw = stubShownNotifications(['chronograma-record-a', 'chronograma-due-a', 'chronograma-due-b', 'chronograma-morning'])
    await closeNotifications(taskNotificationTags('a'))
    expect(sw.closedTags()).toEqual(['chronograma-record-a', 'chronograma-due-a'])
  })

  it('Service Worker の無い環境で出した通知も閉じる', async () => {
    const n = { close: vi.fn(), addEventListener: vi.fn() } as unknown as Notification
    trackPageNotification('chronograma-start-a', n)
    await closeNotifications(['chronograma-start-a'])
    expect(n.close).toHaveBeenCalled()
  })
})

describe('installNotificationCleanup', () => {
  let stop: () => void
  beforeEach(() => {
    useTaskStore.setState({ tasks: [task('a', { dueDate: '2026-10-09' }), task('b', { dueDate: '2026-10-10' })] })
    stop = installNotificationCleanup()
  })
  afterEach(() => stop())

  it('完了にしたら、その件の締切・開始前・記録の確認の通知を閉じる', async () => {
    const sw = stubShownNotifications(['chronograma-due-a', 'chronograma-start-a', 'chronograma-due-b'])
    useTaskStore.getState().toggleTask('a')
    await waitFor(() => expect(sw.closedTags()).toEqual(['chronograma-due-a', 'chronograma-start-a']))
  })

  it('同期で別の端末の完了が届いたときも閉じる', async () => {
    const sw = stubShownNotifications(['chronograma-due-b'])
    useTaskStore.setState((s) => ({ tasks: s.tasks.map((t) => (t.id === 'b' ? { ...t, completed: true } : t)) }))
    await waitFor(() => expect(sw.closedTags()).toEqual(['chronograma-due-b']))
  })

  it('タイマーを止めたら止め忘れの通知を閉じる', async () => {
    useTaskStore.setState({
      activeTimer: { taskTitle: 'x', startedAt: new Date(Date.now() - 3600_000).toISOString(), tags: [], taskId: null, color: null },
    })
    const sw = stubShownNotifications(['chronograma-timer'])
    useTaskStore.getState().stopTimer()
    await waitFor(() => expect(sw.closedTags()).toEqual(['chronograma-timer']))
  })

  it('「あと何分」の時間の通知（#290）は、止めたとき・終わりを選び直したときに閉じる', async () => {
    const startedAt = new Date(Date.now() - 3600_000).toISOString()
    const endsAt = new Date(Date.now() - 60_000).toISOString()
    useTaskStore.setState({ activeTimer: { taskTitle: 'x', startedAt, tags: [], endsAt } })
    const sw = stubShownNotifications(['chronograma-timer-end'])
    useTaskStore.getState().setTimerEnd(new Date(Date.now() + 25 * 60_000).toISOString())
    await waitFor(() => expect(sw.closedTags()).toEqual(['chronograma-timer-end']))

    const again = stubShownNotifications(['chronograma-timer-end'])
    useTaskStore.getState().stopTimer()
    await waitFor(() => expect(again.closedTags()).toEqual(['chronograma-timer-end']))
  })
})

describe('記録の確認（RecordPromptHost）', () => {
  const shift = task('shift', { kind: 'event', scheduledDate: '2026-10-01', startTime: '17:00', endTime: '22:00' })

  it('閉じたら、その件の記録の確認の通知を閉じる', async () => {
    const sw = stubShownNotifications(['chronograma-record-shift', 'chronograma-record-other'])
    useTaskStore.setState({ tasks: [shift] })
    useTaskStore.getState().openRecordPrompt('shift')
    render(<RecordPromptHost />)
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(sw.closedTags()).toEqual(['chronograma-record-shift']))
  })

  it('予定を記録したら（完了にならない予定でも）閉じる', async () => {
    const sw = stubShownNotifications(['chronograma-record-shift', 'chronograma-start-shift'])
    useTaskStore.setState({ tasks: [shift] })
    useTaskStore.getState().openRecordPrompt('shift')
    render(<RecordPromptHost />)
    fireEvent.click(await screen.findByRole('button', { name: 'Log' }))
    await waitFor(() => expect(sw.closedTags()).toEqual(['chronograma-record-shift', 'chronograma-start-shift']))
    expect(useTaskStore.getState().tasks.some(isLogTask)).toBe(true)
  })
})
