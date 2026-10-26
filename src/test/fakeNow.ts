import { beforeEach, vi } from 'vitest'

/**
 * `FAKE_NOW`（ISO の時刻）を付けて走らせたとき、テストが自分で時計を偽物にしていなければ、その時刻から始める
 * （Date だけ偽物にし、時間は進める）。夏時間の切り替わる日・年末の 15:30Z などで全部のテストを回すため
 * （`npm run test:tz`、CI の test-tz）。付けなければ何もしない
 */
// src の型には Node が無いので globalThis から読む
const now = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.FAKE_NOW
if (now) {
  beforeEach(() => {
    if (vi.isFakeTimers()) return
    // 時間は 1 ms ごとに進める（既定の 20 ms ごとだと、続けて保存した 2 つが同じ時刻になって並びが決まらない）
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true, advanceTimeDelta: 1 })
    vi.setSystemTime(new Date(now))
  })
}
