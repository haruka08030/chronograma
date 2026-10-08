import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { TASK_DEFAULTS } from './taskDefaults'
import { closeTaskDetail, useOverlays } from './overlays'
import {
  onWrapUpRequest,
  openTaskFromNotification,
  openWrapUpFromNotification,
  stopTimerFromNotification,
  taskLaunchDate,
} from './notificationLaunch'
import { notifyActiveTimerSynced } from './timerSync'
import { isLogTask, type Task } from '../types/task'
import { appTodayKey } from './timeZone'

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

beforeEach(() => {
  closeTaskDetail()
  useTaskStore.getState().selectView('all')
})
afterEach(() => vi.useRealTimers())

describe('taskLaunchDate', () => {
  it('通知の日が今もその件の日（予定の日・締切日）ならその日', () => {
    const t = task('a', { scheduledDate: '2026-10-09', dueDate: '2026-10-12' })
    expect(taskLaunchDate(t, '2026-10-12')).toBe('2026-10-12')
    expect(taskLaunchDate(t, '2026-10-09')).toBe('2026-10-09')
  })
  it('通知のあとで日を動かしていたら今の日（予定の日、無ければ締切日）', () => {
    expect(taskLaunchDate(task('a', { scheduledDate: '2026-10-10' }), '2026-10-09')).toBe('2026-10-10')
    expect(taskLaunchDate(task('a', { dueDate: '2026-10-11' }), null)).toBe('2026-10-11')
  })
})

describe('openTaskFromNotification', () => {
  it('その To-Do の詳細と、その日の今日の計画を開く', () => {
    useTaskStore.setState({ tasks: [task('es', { dueDate: '2026-10-11' })] })
    openTaskFromNotification('es', '2026-10-11')
    const s = useTaskStore.getState()
    expect(s.selectedView).toBe('planner')
    expect(s.selectedCalendarDateKey).toBe('2026-10-11')
    expect(useOverlays.getState().detailTaskId).toBe('es')
  })

  it('消した件は今日の計画（今日）を開くだけ', () => {
    useTaskStore.setState({ tasks: [task('gone', { dueDate: '2026-10-11', deletedAt: '2026-10-08T00:00:00Z' })] })
    useTaskStore.getState().setSelectedCalendarDateKey('2026-10-01')
    openTaskFromNotification('gone', '2026-10-11')
    expect(useTaskStore.getState().selectedView).toBe('planner')
    expect(useTaskStore.getState().selectedCalendarDateKey).toBe(appTodayKey())
    expect(useOverlays.getState().detailTaskId).toBeNull()
  })

  it('手元にまだ無い件は、同期で届いたら開く', () => {
    useTaskStore.setState({ tasks: [] })
    openTaskFromNotification('later', '2026-10-12', 1000)
    expect(useOverlays.getState().detailTaskId).toBeNull()
    useTaskStore.setState({ tasks: [task('later', { scheduledDate: '2026-10-12', startTime: '13:00', endTime: '14:00' })] })
    expect(useOverlays.getState().detailTaskId).toBe('later')
    expect(useTaskStore.getState().selectedCalendarDateKey).toBe('2026-10-12')
  })

  it('待つ間に別の画面へ移ったら、届いても開かない（時間切れでもやめる）', () => {
    vi.useFakeTimers()
    useTaskStore.setState({ tasks: [] })
    openTaskFromNotification('later', null, 1000)
    useTaskStore.getState().selectView('all')
    useTaskStore.setState({ tasks: [task('later', { dueDate: '2026-10-12' })] })
    expect(useOverlays.getState().detailTaskId).toBeNull()

    useTaskStore.setState({ tasks: [] })
    openTaskFromNotification('late2', null, 1000)
    vi.advanceTimersByTime(1001)
    useTaskStore.setState({ tasks: [task('late2', { dueDate: '2026-10-12' })] })
    expect(useOverlays.getState().detailTaskId).toBeNull()
  })
})

describe('stopTimerFromNotification', () => {
  const startedAt = new Date(Date.now() - 4 * 3600_000).toISOString()
  const running = { taskTitle: '卒論', startedAt, tags: [], taskId: null, color: null }

  it('そのタイマーを止め、できた記録の詳細を開く（終わりの時刻を直せる）', () => {
    useTaskStore.setState({ tasks: [], activeTimer: running })
    stopTimerFromNotification(startedAt)
    const s = useTaskStore.getState()
    expect(s.activeTimer).toBeNull()
    const log = s.tasks.find(isLogTask)!
    expect(log.title).toBe('卒論')
    expect(useOverlays.getState().detailTaskId).toBe(log.id)
    expect(s.selectedView).toBe('planner')
  })

  it('別のタイマーが動いているときは止めずに知らせる', () => {
    const other = { ...running, startedAt: new Date(Date.now() - 600_000).toISOString() }
    useTaskStore.setState({ tasks: [], activeTimer: other })
    stopTimerFromNotification(startedAt)
    expect(useTaskStore.getState().activeTimer).toEqual(other)
    expect(useTaskStore.getState().moveBannerText).toEqual({ key: 'reminders.timerAlreadyStopped' })
    expect(useOverlays.getState().detailTaskId).toBeNull()
  })

  it('ログイン中は、タイマーの同期を待ってから決める（別の端末で止めていたら記録を足さない）', () => {
    useTaskStore.setState({ tasks: [], activeTimer: running, dataOwner: 'user-1' })
    stopTimerFromNotification(startedAt, 1000)
    expect(useTaskStore.getState().activeTimer).toEqual(running)
    // 同期で「別の端末で止めた」が届く
    useTaskStore.setState({ activeTimer: null })
    notifyActiveTimerSynced()
    expect(useTaskStore.getState().tasks).toEqual([])
    expect(useTaskStore.getState().moveBannerText).toEqual({ key: 'reminders.timerAlreadyStopped' })
  })

  it('同期が来なくても、待つ上限を過ぎたら手元のタイマーで止める', () => {
    vi.useFakeTimers()
    useTaskStore.setState({ tasks: [], activeTimer: running, dataOwner: 'user-1' })
    stopTimerFromNotification(startedAt, 1000)
    vi.advanceTimersByTime(1001)
    expect(useTaskStore.getState().activeTimer).toBeNull()
    expect(useTaskStore.getState().tasks.filter(isLogTask)).toHaveLength(1)
    // あとから同期が来ても 2 回目は動かない
    notifyActiveTimerSynced()
    expect(useTaskStore.getState().tasks.filter(isLogTask)).toHaveLength(1)
  })
})

describe('openWrapUpFromNotification（夜の締め）', () => {
  it('今日の計画（今日）を開き、受け取っている今日の計画に 1 回だけ知らせる', () => {
    useTaskStore.getState().setSelectedCalendarDateKey('2020-01-01')
    const fn = vi.fn()
    const stop = onWrapUpRequest(fn)
    openWrapUpFromNotification()
    expect(useTaskStore.getState().selectedView).toBe('planner')
    expect(useTaskStore.getState().selectedCalendarDateKey).toBe(appTodayKey())
    expect(fn).toHaveBeenCalledTimes(1)
    // 受け取った頼みは消える（あとで受け取り始めた所へもう一度は行かない）
    const later = vi.fn()
    const stopLater = onWrapUpRequest(later)
    expect(later).not.toHaveBeenCalled()
    stop()
    stopLater()
  })

  it('まだ誰も受け取っていなければ、受け取り始めたときに知らせる', () => {
    openWrapUpFromNotification()
    const fn = vi.fn()
    const stop = onWrapUpRequest(fn)
    expect(fn).toHaveBeenCalledTimes(1)
    stop()
  })
})
