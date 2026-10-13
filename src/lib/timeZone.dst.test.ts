import { format, startOfDay } from 'date-fns'
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
        const wall = toAppWall(ms)
        expect(localWall(wall)).toEqual(tokyo)
        expect(fromAppWall(wall).getTime()).toBe(ms)
        checked++
      }
      expect(checked).toBe(97)
    })
  }

  // 東京 3/8 2:30 は端末（New York）に存在しない時刻（#342）
  const gap = Date.parse('2026-03-07T17:30:00Z')

  it('端末に存在しない壁時計でも、date-fns で書式・日の始まりを出せる', () => {
    const wall = toAppWall(gap)
    expect(format(wall, 'yyyy-MM-dd HH:mm')).toBe('2026-03-08 02:30')
    expect(format(startOfDay(wall), 'yyyy-MM-dd HH:mm')).toBe('2026-03-08 00:00')
  })

  it('端末に存在しない壁時計の分だけを変えても、時と日はそのまま', () => {
    const wall = toAppWall(gap)
    wall.setMinutes(45)
    expect(localWall(wall)).toEqual({ date: '2026-03-08', time: '02:45' })
    expect(fromAppWall(wall).getTime()).toBe(gap + 15 * 60_000)
  })
})
