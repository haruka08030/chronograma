import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/** ▶ の記録の「あと何分」（集中タイマー、#290）をストアで確かめる */
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
const NOW = '2026-10-08T00:00:00.000Z'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(NOW))
  useTaskStore.setState({ tasks: [], activeTimer: null, completePromptTaskId: null, labelPromptLogId: null })
})
afterEach(() => vi.useRealTimers())

describe('「あと何分」を付けて始める', () => {
  it('長さを付けて始めると、始めた時刻から N 分後が終わりになる', () => {
    useTaskStore.getState().startTimer('レポート', [], null, null, { minutes: 25 })
    expect(useTaskStore.getState().activeTimer).toMatchObject({ taskTitle: 'レポート', startedAt: NOW, endsAt: '2026-10-08T00:25:00.000Z' })
  })

  it('付けなければ今までどおり数え上げ（終わりの項目を持たない）', () => {
    useTaskStore.getState().startTimer('レポート')
    expect(useTaskStore.getState().activeTimer).not.toHaveProperty('endsAt')
  })
})

describe('setTimerEnd', () => {
  it('動いているタイマーに終わりを付け、選び直し、外せる', () => {
    const s = useTaskStore.getState()
    s.startTimer('レポート')
    vi.setSystemTime(new Date('2026-10-08T00:05:00.000Z'))
    s.setTimerEnd('2026-10-08T00:55:00.000Z')
    expect(useTaskStore.getState().activeTimer?.endsAt).toBe('2026-10-08T00:55:00.000Z')
    s.setTimerEnd('2026-10-08T01:35:00.000Z')
    expect(useTaskStore.getState().activeTimer?.endsAt).toBe('2026-10-08T01:35:00.000Z')
    s.setTimerEnd(null)
    expect(useTaskStore.getState().activeTimer).not.toHaveProperty('endsAt')
    expect(useTaskStore.getState().activeTimer).toMatchObject({ taskTitle: 'レポート', startedAt: NOW })
  })

  it('始めた時刻より前・1 日より先の終わりは付けない。止まっていれば何もしない', () => {
    const s = useTaskStore.getState()
    s.setTimerEnd('2026-10-08T00:25:00.000Z')
    expect(useTaskStore.getState().activeTimer).toBeNull()
    s.startTimer('レポート')
    s.setTimerEnd('2026-10-07T23:00:00.000Z')
    s.setTimerEnd('2026-10-09T01:00:00.000Z')
    expect(useTaskStore.getState().activeTimer).not.toHaveProperty('endsAt')
  })

  it('同じ終わりを選んでもタイマーは替わらない（送り直さない）', () => {
    const s = useTaskStore.getState()
    s.startTimer('レポート', [], null, null, { minutes: 25 })
    const before = useTaskStore.getState().activeTimer
    s.setTimerEnd('2026-10-08T00:25:00.000Z')
    expect(useTaskStore.getState().activeTimer).toBe(before)
  })

  it('時間を過ぎても止めない。止めると今までどおり記録 1 本（終わりは記録に残さない）', () => {
    const s = useTaskStore.getState()
    s.startTimer('レポート', ['ゼミ'], null, null, { minutes: 25 })
    vi.setSystemTime(new Date('2026-10-08T00:40:00.000Z'))
    expect(useTaskStore.getState().activeTimer).not.toBeNull()
    s.stopTimer()
    const logs = useTaskStore.getState().tasks.filter((t) => t.kind === 'log')
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ title: 'レポート', category: 'ゼミ' })
    expect(logs[0]).not.toHaveProperty('endsAt')
    expect(useTaskStore.getState().activeTimer).toBeNull()
  })
})
