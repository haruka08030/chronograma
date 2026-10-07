import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { deviceTimeZone, fromAppWall, setAppTimeZoneSetting, toAppWall, wallInZone } from './timeZone'

/**
 * 端末とアプリのタイムゾーンが違う人が、端末の夏時間の切り替えをまたぐとき（#273）。
 * Node は実行中に TZ を替えると Date と Intl の端末のタイムゾーンも替わる
 */
beforeAll(() => {
  vi.stubEnv('TZ', 'America/New_York')
  setAppTimeZoneSetting('Asia/Tokyo')
})
afterAll(() => {
  setAppTimeZoneSetting(null)
  vi.unstubAllEnvs()
})

const pad = (n: number) => String(n).padStart(2, '0')
const localWall = (d: Date) => ({
  date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
  time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
})

/** その壁時計が端末のローカル時刻として存在するか */
function existsOnDevice(w: { date: string; time: string }): boolean {
  const [y, mo, d] = w.date.split('-').map(Number)
  const [h, mi] = w.time.split(':').map(Number)
  const local = new Date(y!, mo! - 1, d!, h!, mi!)
  return local.getHours() === h && local.getMinutes() === mi
}

describe('端末 New York・アプリ 東京で、端末の夏時間の切り替えの前後', () => {
  it('端末のタイムゾーンが New York になっている', () => {
    expect(deviceTimeZone()).toBe('America/New_York')
  })

  for (const switchAt of ['2026-03-08T07:00:00Z', '2026-11-01T06:00:00Z']) {
    it(`${switchAt.slice(0, 10)} の前後 24 時間、30 分おきに東京の壁時計と一致し、元の瞬間に戻る`, () => {
      const center = Date.parse(switchAt)
      let checked = 0
      for (let ms = center - 24 * 3_600_000; ms <= center + 24 * 3_600_000; ms += 30 * 60_000) {
        const tokyo = wallInZone(ms, 'Asia/Tokyo')
        // 東京の壁時計が端末で存在しない時刻（New York の 3/8 2:00〜3:00）は、端末のローカルの Date では表せない（#342）
        if (!existsOnDevice(tokyo)) continue
        const wall = toAppWall(ms)
        expect(localWall(wall)).toEqual(tokyo)
        expect(fromAppWall(wall).getTime()).toBe(ms)
        checked++
      }
      expect(checked).toBeGreaterThanOrEqual(95)
    })
  }
})
