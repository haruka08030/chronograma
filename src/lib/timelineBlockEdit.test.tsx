import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { makeTask } from '../store/taskHelpers'
import { INBOX_LIST_ID } from '../store/storeConstants'
import type { CalendarEvent } from '../types/calendarEvent'
import type { Task } from '../types/task'
import { appTimeZone, instantFromWall } from './timeZone'
import { applyBlockMove, applyBlockResize, logLimitAt, nudgedDayRange, nudgeTimelineBlock } from './timelineBlockEdit'
import { everyDaySleepSchedule, sleepPlanOn, sleepSlotId } from './sleepSchedule'

const setMyGoogleEventTime = vi.hoisted(() => vi.fn())
vi.mock('./googleEventEdit', async (orig) => ({ ...(await orig<typeof import('./googleEventEdit')>()), setMyGoogleEventTime }))

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
  setMyGoogleEventTime.mockReset()
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

  it('自分の時間にする（Google へは送らない、#625）', () => {
    useTaskStore.setState({ calendarEvents: [gEvent()], googleCanWrite: true })
    expect(nudgeTimelineBlock('event-g', 'move', 1, NOW)).toEqual({ title: 'Meeting', startTime: '10:15', endTime: '11:15' })
    expect(setMyGoogleEventTime).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'g' }),
      expect.objectContaining({ date: '2026-10-07', startTime: '10:15', endTime: '11:15' }),
    )
    nudgeTimelineBlock('event-g', 'resize', -1, NOW)
    expect(setMyGoogleEventTime).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'g' }),
      expect.objectContaining({ startTime: '10:00', endTime: '10:45' }),
    )
  })

  it('主催者でない・書き込めない予定も自分の時間にできる', () => {
    useTaskStore.setState({ calendarEvents: [gEvent({ editable: false })], googleCanWrite: false })
    expect(nudgeTimelineBlock('event-g', 'move', 1, NOW)).toEqual({ title: 'Meeting', startTime: '10:15', endTime: '11:15' })
  })

  it('終日・日をまたぐ予定は動かさない', () => {
    useTaskStore.setState({
      calendarEvents: [gEvent({ isAllDay: true, startTime: null, endTime: null, start: '2026-10-07', end: '2026-10-08' })],
    })
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
    expect(setMyGoogleEventTime).not.toHaveBeenCalled()
  })
})

describe('睡眠の予定の枠（#660）', () => {
  // 2026-10-08（木）の朝。曜日の予定は毎日 23:30–07:00
  const WAKE = '2026-10-08'
  const id = sleepSlotId(WAKE)
  const ctx = { logLimit: logLimitAt(NOW) }
  const planOn = (day: string) => {
    const { sleepSchedule, sleepDays } = useTaskStore.getState().addons
    return sleepPlanOn(sleepSchedule ?? {}, day, sleepDays)
  }
  beforeEach(() => {
    useTaskStore.setState((s) => ({
      addons: { ...s.addons, sleepSchedule: everyDaySleepSchedule({ bed: '23:30', wake: '07:00' }), sleepDays: {} },
    }))
  })

  it('朝の区間を 30 分下げると、寝る・起きるとも 30 分遅れ、その朝だけ変わる', () => {
    expect(applyBlockMove(id, WAKE, '00:30', '07:30', ctx)).toBe(true)
    expect(planOn(WAKE)).toEqual({ bed: '00:00', wake: '07:30' })
    expect(planOn('2026-10-15')).toEqual({ bed: '23:30', wake: '07:00' })
  })

  it('夜の区間（前の日の列）をつかんで動かしても同じ 1 つの睡眠として動く', () => {
    expect(applyBlockMove(id, '2026-10-07', '23:00', '23:59', ctx)).toBe(true)
    expect(planOn(WAKE)).toEqual({ bed: '23:00', wake: '06:30' })
  })

  it('起きる日が変わる動かし方はしない', () => {
    expect(applyBlockMove(id, WAKE, '17:30', '18:00', ctx)).toBe(false)
    expect(planOn(WAKE)).toEqual({ bed: '23:30', wake: '07:00' })
  })

  it('朝の区間の下の端で起きるだけ、夜の区間の上の端で寝るだけ変わる。いつもの時刻に戻すとその朝の時刻は消える', () => {
    expect(applyBlockResize(id, '00:00', '08:00', WAKE, ctx)).toBe(true)
    expect(planOn(WAKE)).toEqual({ bed: '23:30', wake: '08:00' })
    expect(applyBlockResize(id, '22:30', '24:00', '2026-10-07', ctx)).toBe(true)
    expect(planOn(WAKE)).toEqual({ bed: '22:30', wake: '08:00' })
    useTaskStore.getState().setSleepPlanDay(WAKE, { bed: '23:30', wake: '07:00' })
    expect(useTaskStore.getState().addons.sleepDays).toEqual({})
  })

  it('Alt+↑↓ で 15 分ずつ動く・伸びる。⌘Z で戻る', () => {
    expect(nudgeTimelineBlock(id, 'move', 1, NOW)).toMatchObject({ startTime: '23:45', endTime: '07:15' })
    expect(nudgeTimelineBlock(id, 'resize', -1, NOW)).toMatchObject({ startTime: '23:45', endTime: '07:00' })
    useTaskStore.getState().undoLastOperation()
    useTaskStore.getState().undoLastOperation()
    expect(planOn(WAKE)).toEqual({ bed: '23:30', wake: '07:00' })
  })

  it('その日は予定なしにできる', () => {
    useTaskStore.getState().setSleepPlanDay(WAKE, null)
    expect(planOn(WAKE)).toBeNull()
    expect(planOn('2026-10-09')).toEqual({ bed: '23:30', wake: '07:00' })
  })
})
