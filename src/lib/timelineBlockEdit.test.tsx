import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { makeTask } from '../store/taskHelpers'
import { INBOX_LIST_ID } from '../store/storeConstants'
import type { CalendarEvent } from '../types/calendarEvent'
import type { Task } from '../types/task'
import { appTimeZone, instantFromWall } from './timeZone'
import { nudgedDayRange, nudgeTimelineBlock } from './timelineBlockEdit'

const moveGoogleEvent = vi.hoisted(() => vi.fn())
vi.mock('./googleEventEdit', async (orig) => ({ ...(await orig<typeof import('./googleEventEdit')>()), moveGoogleEvent }))

/** 2026-10-07 15:00（記録はこれより先にできない） */
const NOW = new Date(2026, 9, 7, 15, 0)

const tick = () => new Promise((r) => queueMicrotask(() => r(null)))

function plan(id: string, startTime: string, endTime: string, extra: Partial<Task> = {}): Task {
  return { ...makeTask({ title: id, listId: INBOX_LIST_ID, scheduledDate: '2026-10-07', startTime, endTime }, 0), id, ...extra }
}

function log(id: string, dueDate: string, startTime: string, endTime: string, endDate: string | null = null): Task {
  return { ...makeTask({ title: id, listId: INBOX_LIST_ID, dueDate, startTime, endTime, endDate, kind: 'log' }, 0), id }
}

const get = (id: string) => useTaskStore.getState().tasks.find((x) => x.id === id)!
const times = (id: string) => {
  const t = get(id)
  return { dueDate: t.dueDate, scheduledDate: t.scheduledDate, startTime: t.startTime, endTime: t.endTime, endDate: t.endDate ?? null }
}

beforeEach(() => {
  moveGoogleEvent.mockReset()
  while (useTaskStore.getState().undoLastOperation()) {
    /* 前のテストの履歴を残さない */
  }
})

describe('nudgedDayRange', () => {
  it('動かすと開始も終わりも 15 分ずれる。分は丸めない', () => {
    expect(nudgedDayRange('10:00', '11:00', 'move', 1)).toEqual({ startTime: '10:15', endTime: '11:15' })
    expect(nudgedDayRange('10:07', '10:52', 'move', -1)).toEqual({ startTime: '09:52', endTime: '10:37' })
  })

  it('伸び縮みは終わりだけ。15 分より短くはしない', () => {
    expect(nudgedDayRange('10:00', '11:00', 'resize', 1)).toEqual({ startTime: '10:00', endTime: '11:15' })
    expect(nudgedDayRange('10:00', '10:30', 'resize', -1)).toEqual({ startTime: '10:00', endTime: '10:15' })
    expect(nudgedDayRange('10:00', '10:15', 'resize', -1)).toBeNull()
  })

  it('日の外へは出さない（0:00 終わりは日の終わり）', () => {
    expect(nudgedDayRange('00:00', '01:00', 'move', -1)).toBeNull()
    expect(nudgedDayRange('23:00', '00:00', 'move', 1)).toBeNull()
    expect(nudgedDayRange('22:45', '23:45', 'move', 1)).toEqual({ startTime: '23:00', endTime: '00:00' })
    expect(nudgedDayRange('23:00', '23:45', 'resize', 1)).toEqual({ startTime: '23:00', endTime: '24:00' })
    expect(nudgedDayRange('23:00', '00:00', 'resize', 1)).toBeNull()
    expect(nudgedDayRange('23:00', '00:00', 'resize', -1)).toEqual({ startTime: '23:00', endTime: '23:45' })
  })
})

describe('nudgeTimelineBlock: 予定', () => {
  it('Alt+↓ で 15 分後へ。⌘Z で戻り、トーストに新しい時刻が出る', async () => {
    useTaskStore.setState({ tasks: [plan('p', '10:00', '11:00')] })
    expect(nudgeTimelineBlock('p', 'move', 1, NOW)).toEqual({ title: 'p', startTime: '10:15', endTime: '11:15' })
    expect(times('p')).toMatchObject({ scheduledDate: '2026-10-07', startTime: '10:15', endTime: '11:15' })
    expect(useTaskStore.getState().undoBanner?.text).toMatchObject({ key: 'undo.blockMoved', params: { time: '10:15–11:15' } })
    await tick()
    expect(useTaskStore.getState().undoLastOperation()).toBe(true)
    expect(times('p')).toMatchObject({ startTime: '10:00', endTime: '11:00' })
  })

  it('続けて押すと 1 回ずつ戻せる', async () => {
    useTaskStore.setState({ tasks: [plan('p', '10:00', '11:00')] })
    nudgeTimelineBlock('p', 'move', -1, NOW)
    await tick()
    nudgeTimelineBlock('p', 'move', -1, NOW)
    await tick()
    expect(times('p')).toMatchObject({ startTime: '09:30', endTime: '10:30' })
    useTaskStore.getState().undoLastOperation()
    expect(times('p')).toMatchObject({ startTime: '09:45', endTime: '10:45' })
  })

  it('Alt+Shift+↑↓ は終わりだけ。予定は今より先でもよい', () => {
    useTaskStore.setState({ tasks: [plan('p', '18:00', '18:30')] })
    expect(nudgeTimelineBlock('p', 'resize', 1, NOW)).toMatchObject({ startTime: '18:00', endTime: '18:45' })
    expect(useTaskStore.getState().undoBanner?.text).toMatchObject({ key: 'undo.blockResized' })
    nudgeTimelineBlock('p', 'resize', -1, NOW)
    nudgeTimelineBlock('p', 'resize', -1, NOW)
    expect(times('p')).toMatchObject({ startTime: '18:00', endTime: '18:15' })
    // 15 分より短くはしない
    expect(nudgeTimelineBlock('p', 'resize', -1, NOW)).toBeNull()
    expect(times('p')).toMatchObject({ endTime: '18:15' })
  })

  it('日の端・何日も続く予定は動かさない', () => {
    useTaskStore.setState({ tasks: [plan('a', '00:00', '01:00'), plan('b', '10:00', '11:00', { endDate: '2026-10-08' })] })
    expect(nudgeTimelineBlock('a', 'move', -1, NOW)).toBeNull()
    expect(nudgeTimelineBlock('b', 'move', 1, NOW)).toBeNull()
    expect(times('a')).toMatchObject({ startTime: '00:00', endTime: '01:00' })
  })
})

describe('nudgeTimelineBlock: 記録（今より先にはしない）', () => {
  it('今を越えて後ろへは動かせない。前へは動かせる', () => {
    useTaskStore.setState({ tasks: [log('l', '2026-10-07', '13:00', '14:50')] })
    expect(nudgeTimelineBlock('l', 'move', 1, NOW)).toBeNull()
    expect(times('l')).toMatchObject({ startTime: '13:00', endTime: '14:50' })
    expect(nudgeTimelineBlock('l', 'move', -1, NOW)).toMatchObject({ startTime: '12:45', endTime: '14:35' })
    expect(times('l')).toMatchObject({ dueDate: '2026-10-07', startTime: '12:45', endTime: '14:35', endDate: null })
  })

  it('伸ばすときは今で止める。もう今まであれば何もしない', () => {
    useTaskStore.setState({ tasks: [log('l', '2026-10-07', '13:00', '14:50')] })
    expect(nudgeTimelineBlock('l', 'resize', 1, NOW)).toMatchObject({ startTime: '13:00', endTime: '15:00' })
    expect(nudgeTimelineBlock('l', 'resize', 1, NOW)).toBeNull()
    expect(times('l')).toMatchObject({ endTime: '15:00' })
  })

  it('0:00 の前へ動かすと前の日の記録になる（日をまたぐ）', () => {
    useTaskStore.setState({ tasks: [log('l', '2026-10-06', '00:00', '01:00')] })
    nudgeTimelineBlock('l', 'move', -1, NOW)
    expect(times('l')).toMatchObject({ dueDate: '2026-10-05', startTime: '23:45', endTime: '00:45', endDate: '2026-10-06' })
    expect(useTaskStore.getState().undoBanner?.text).toMatchObject({ key: 'undo.blockMoved' })
  })

  it('日をまたぐ記録は暦の上でずれ、日をまたがなくなれば endDate を外す', () => {
    useTaskStore.setState({ tasks: [log('l', '2026-10-05', '23:30', '00:15', '2026-10-06')] })
    nudgeTimelineBlock('l', 'resize', -1, NOW)
    expect(times('l')).toMatchObject({ dueDate: '2026-10-05', startTime: '23:30', endTime: '00:00', endDate: null })
    nudgeTimelineBlock('l', 'resize', 1, NOW)
    nudgeTimelineBlock('l', 'resize', 1, NOW)
    expect(times('l')).toMatchObject({ dueDate: '2026-10-05', startTime: '23:30', endTime: '00:30', endDate: '2026-10-06' })
  })

  it('15 分より短くは縮めない', () => {
    useTaskStore.setState({ tasks: [log('l', '2026-10-06', '10:00', '10:10')] })
    expect(nudgeTimelineBlock('l', 'resize', -1, NOW)).toBeNull()
  })
})

describe('nudgeTimelineBlock: Google の予定（ドラッグと同じ決まり）', () => {
  function gEvent(over: Partial<CalendarEvent> = {}): CalendarEvent {
    const tz = appTimeZone()
    return {
      id: 'g',
      summary: 'Meeting',
      start: new Date(instantFromWall('2026-10-07', '10:00', tz)).toISOString(),
      end: new Date(instantFromWall('2026-10-07', '11:00', tz)).toISOString(),
      startTime: '10:00',
      endTime: '11:00',
      date: '2026-10-07',
      isAllDay: false,
      ...over,
    }
  }

  it('書き換えられる予定は Google へ送る', () => {
    useTaskStore.setState({ calendarEvents: [gEvent()], googleCanWrite: true })
    expect(nudgeTimelineBlock('event-g', 'move', 1, NOW)).toEqual({ title: 'Meeting', startTime: '10:15', endTime: '11:15' })
    expect(moveGoogleEvent).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'g' }),
      expect.objectContaining({ date: '2026-10-07', startTime: '10:15', endTime: '11:15' }),
    )
    nudgeTimelineBlock('event-g', 'resize', -1, NOW)
    expect(moveGoogleEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'g' }),
      expect.objectContaining({ startTime: '10:00', endTime: '10:45' }),
    )
  })

  it('書き込めない・変更を許されていない・日をまたぐ予定は動かさない', () => {
    useTaskStore.setState({ calendarEvents: [gEvent()], googleCanWrite: false })
    expect(nudgeTimelineBlock('event-g', 'move', 1, NOW)).toBeNull()
    useTaskStore.setState({ calendarEvents: [gEvent({ editable: false })], googleCanWrite: true })
    expect(nudgeTimelineBlock('event-g', 'move', 1, NOW)).toBeNull()
    const tz = appTimeZone()
    const night = gEvent({
      startTime: '22:00',
      endTime: '02:00',
      start: new Date(instantFromWall('2026-10-07', '22:00', tz)).toISOString(),
      end: new Date(instantFromWall('2026-10-08', '02:00', tz)).toISOString(),
    })
    useTaskStore.setState({ calendarEvents: [night], googleCanWrite: true })
    expect(nudgeTimelineBlock('event-g', 'move', -1, NOW)).toBeNull()
    expect(moveGoogleEvent).not.toHaveBeenCalled()
  })
})
