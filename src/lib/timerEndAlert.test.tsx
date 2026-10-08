import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n/config'
import type { ActiveTimer } from '../store/storeTypes'
import { checkTimerEnd, LOCAL_LATE_MS, timerEndAlertDue } from './timerEndAlert'

const END = Date.parse('2026-10-08T00:25:00.000Z')
const timer = (patch: Partial<ActiveTimer> = {}): ActiveTimer => ({
  taskTitle: 'レポート',
  startedAt: '2026-10-08T00:00:00.000Z',
  tags: [],
  endsAt: new Date(END).toISOString(),
  ...patch,
})

/** ページの通知（Service Worker の無いとき）の偽物 */
const shown: { title: string; body?: string; tag?: string }[] = []
class FakeNotification {
  static permission: NotificationPermission = 'granted'
  onclick: (() => void) | null = null
  constructor(title: string, opts?: NotificationOptions) {
    shown.push({ title, body: opts?.body, tag: opts?.tag })
  }
  close() {}
}

beforeAll(() => i18n.changeLanguage('ja'))
afterAll(() => i18n.changeLanguage('en'))
beforeEach(() => {
  shown.length = 0
  localStorage.clear()
  FakeNotification.permission = 'granted'
  vi.stubGlobal('Notification', FakeNotification)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('timerEndAlertDue', () => {
  it('終わりを過ぎてから LOCAL_LATE_MS まで。前・遅すぎ・終わりなし・知らせた終わりは出さない', () => {
    expect(timerEndAlertDue(timer(), END - 1, null)).toBe(false)
    expect(timerEndAlertDue(timer(), END, null)).toBe(true)
    expect(timerEndAlertDue(timer(), END + LOCAL_LATE_MS - 1, null)).toBe(true)
    // 閉じていた間に過ぎていた（Web Push が知らせている）
    expect(timerEndAlertDue(timer(), END + LOCAL_LATE_MS, null)).toBe(false)
    expect(timerEndAlertDue(timer({ endsAt: null }), END, null)).toBe(false)
    expect(timerEndAlertDue(null, END, null)).toBe(false)
    // 書き方が違っても同じ時刻なら知らせた扱い
    expect(timerEndAlertDue(timer(), END, '2026-10-08T09:25:00+09:00')).toBe(false)
  })
})

describe('checkTimerEnd（タブで知らせる）', () => {
  it('時間になったら 1 回だけ知らせ、ほかの端末の Web Push を止める印を付ける', async () => {
    const markNotified = vi.fn()
    const deps = { onOpen: vi.fn(), markNotified, nowMs: END + 1_000 }
    expect(checkTimerEnd(timer(), deps)).toBe(true)
    await flush()
    expect(shown).toEqual([{ title: '「レポート」の時間です', body: '記録は止めずに続けています', tag: 'chronograma-timer-end' }])
    expect(markNotified).toHaveBeenCalledWith(new Date(END).toISOString())

    // 次の見回り・読み込み直し・2 つ目のタブ: 同じ終わりにはもう出さない
    expect(checkTimerEnd(timer(), { ...deps, nowMs: END + 30_000 })).toBe(false)
    await flush()
    expect(shown).toHaveLength(1)
    expect(markNotified).toHaveBeenCalledTimes(1)
  })

  it('終わりを選び直したら、新しい終わりでもう 1 回', async () => {
    const deps = { onOpen: vi.fn(), nowMs: END }
    checkTimerEnd(timer(), deps)
    const later = END + 25 * 60_000
    expect(checkTimerEnd(timer({ endsAt: new Date(later).toISOString() }), { ...deps, nowMs: later })).toBe(true)
    await flush()
    expect(shown).toHaveLength(2)
  })

  it('時間の前は何もしない', async () => {
    expect(checkTimerEnd(timer(), { onOpen: vi.fn(), nowMs: END - 1_000 })).toBe(false)
    await flush()
    expect(shown).toEqual([])
  })

  it('通知の許可が無ければ通知は出さず、ほかの端末の Web Push も止めない', async () => {
    FakeNotification.permission = 'default'
    const markNotified = vi.fn()
    expect(checkTimerEnd(timer(), { onOpen: vi.fn(), markNotified, nowMs: END })).toBe(true)
    await flush()
    expect(shown).toEqual([])
    expect(markNotified).not.toHaveBeenCalled()
  })
})
