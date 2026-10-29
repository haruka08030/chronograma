import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/** 題名・ラベルが「睡眠」の記録は、後から記録・▶ の記録・予定を記録にしたものも睡眠（#519・#651）。習慣のチェックの記録はそのまま */
beforeAll(() => {
  const mem = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  })
})
vi.mock('../i18n/config', () => ({
  default: { t: (k: string, o?: { returnObjects?: boolean }) => (o?.returnObjects ? [] : k), language: 'ja' },
}))

const { useTaskStore } = await import('./taskStore')

beforeEach(() => {
  useTaskStore.setState({ tasks: [], activeTimer: null, completePromptTaskId: null, labelPromptLogId: null })
})

describe('題名・ラベルで睡眠にする（#651）', () => {
  it('記録の題名・ラベルが「睡眠」「sleep」なら睡眠', () => {
    const s = useTaskStore.getState()
    s.addTimeLog('睡眠', '2026-10-07', '23:30', '07:00', [], undefined, '2026-10-08')
    s.addTimeLog('夜', '2026-10-07', '01:00', '02:00', ['sleep'])
    s.addTimeLog('レポート', '2026-10-08', '10:00', '11:00', [])
    expect(useTaskStore.getState().tasks.map((t) => t.kind)).toEqual(['sleep', 'sleep', 'log'])
  })

  it('▶ の記録も題名が「sleep」なら睡眠', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 8, 1, 0))
    useTaskStore.getState().startTimer('sleep')
    vi.setSystemTime(new Date(2026, 9, 8, 2, 0))
    useTaskStore.getState().stopTimer()
    vi.useRealTimers()
    expect(useTaskStore.getState().tasks.map((t) => t.kind)).toEqual(['sleep'])
  })

  it('予定を ✓ で記録にしたもの（時刻つきの完了の記録）も睡眠。習慣のチェックの記録はそのまま', () => {
    useTaskStore.getState().addCompletedTaskWithTime('sleep', '2026-10-08', '00:00', '08:00', null)
    expect(useTaskStore.getState().tasks.map((t) => t.kind)).toEqual(['sleep'])
  })

  it('睡眠の入力（logSleep）からは睡眠になる', () => {
    useTaskStore.getState().logSleep('2026-10-08', '23:30', '07:00')
    expect(useTaskStore.getState().tasks.map((t) => t.kind)).toEqual(['sleep'])
  })

  it('重ならない睡眠は足し（昼寝）、重なる睡眠・id を渡した睡眠は直す（#645）', () => {
    const s = useTaskStore.getState()
    s.logSleep('2026-10-08', '23:30', '07:00')
    s.logSleep('2026-10-08', '13:00', '15:00')
    expect(useTaskStore.getState().tasks.map((t) => t.startTime)).toEqual(['23:30', '13:00'])
    s.logSleep('2026-10-08', '23:00', '07:30')
    expect(useTaskStore.getState().tasks.map((t) => t.startTime)).toEqual(['23:00', '13:00'])
    const nap = useTaskStore.getState().tasks[1]!
    s.logSleep('2026-10-08', '16:00', '17:00', nap.id)
    expect(useTaskStore.getState().tasks.map((t) => `${t.startTime}-${t.endTime}`)).toEqual(['23:00-07:30', '16:00-17:00'])
  })
})

describe('睡眠のタイマー（寝る・起きた）', () => {
  const at = (d: number, h: number, m = 0) => vi.setSystemTime(new Date(2026, 9, d, h, m))
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    useTaskStore.setState({ sleepTimer: null, undoBanner: null })
  })
  afterEach(() => vi.useRealTimers())

  it('寝ると押してから起きたと押すと、その朝の睡眠になってタイマーは消える', () => {
    at(7, 23, 30)
    useTaskStore.getState().goToBed()
    expect(useTaskStore.getState().sleepTimer).not.toBeNull()
    at(8, 7, 5)
    expect(useTaskStore.getState().wakeUp()).toBe('saved')
    const s = useTaskStore.getState()
    expect(s.sleepTimer).toBeNull()
    expect(s.tasks).toHaveLength(1)
    expect(s.tasks[0]).toMatchObject({ kind: 'sleep', dueDate: '2026-10-07', endDate: '2026-10-08', startTime: '23:30', endTime: '07:05' })
  })

  it('記録のタイマーが動いていたら、記録にして止めてから寝る', () => {
    at(7, 22, 0)
    useTaskStore.getState().startTimer('読書')
    at(7, 23, 0)
    useTaskStore.getState().goToBed()
    const s = useTaskStore.getState()
    expect(s.activeTimer).toBeNull()
    expect(s.tasks.map((t) => [t.kind, t.title, t.startTime, t.endTime])).toEqual([['log', '読書', '22:00', '23:00']])
  })

  it('1 分未満は睡眠にせず止め、16 時間より長いと何もしない（起きた時刻を聞く）', () => {
    at(7, 23, 0)
    useTaskStore.getState().goToBed()
    expect(useTaskStore.getState().wakeUp()).toBe('short')
    expect(useTaskStore.getState().sleepTimer).toBeNull()

    useTaskStore.getState().goToBed()
    at(8, 16, 0)
    expect(useTaskStore.getState().wakeUp()).toBe('long')
    expect(useTaskStore.getState().sleepTimer).not.toBeNull()
    expect(useTaskStore.getState().tasks).toHaveLength(0)
  })

  it('取り消すと消え、トーストの「元に戻す」で戻る', () => {
    at(7, 23, 0)
    useTaskStore.getState().goToBed()
    const timer = useTaskStore.getState().sleepTimer
    useTaskStore.getState().cancelSleep(true)
    expect(useTaskStore.getState().sleepTimer).toBeNull()
    expect(useTaskStore.getState().undoBanner).toMatchObject({ restoreSleepTimer: true })
    expect(useTaskStore.getState().restoreCancelledSleep()).toBe(true)
    expect(useTaskStore.getState().sleepTimer).toEqual(timer)
  })
})
