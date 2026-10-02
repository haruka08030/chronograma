import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DUE_NOTIFY_MINUTES,
  isWithinTick,
  minutesOfClock,
  selectDueToNotify,
  type DueCandidate,
} from './schedule'

const task = (p: Partial<DueCandidate> & { id: string }): DueCandidate => ({
  title: p.id,
  due_time: null,
  list_id: 'inbox',
  ...p,
})

const opts = (p: Partial<Parameters<typeof selectDueToNotify>[1]> & { nowMinutes: number }) => ({
  excludedListIds: new Set<string>(),
  notifiedIds: new Set<string>(),
  ...p,
})

describe('minutesOfClock', () => {
  it('HH:mm と HH:mm:ss の両方を読む', () => {
    expect(minutesOfClock('09:30')).toBe(570)
    expect(minutesOfClock('09:30:00')).toBe(570)
    expect(minutesOfClock('9:05')).toBe(545)
  })

  it('空・壊れた値・範囲外は null', () => {
    expect(minutesOfClock(null)).toBeNull()
    expect(minutesOfClock('')).toBeNull()
    expect(minutesOfClock('あとで')).toBeNull()
    expect(minutesOfClock('24:00')).toBeNull()
    expect(minutesOfClock('10:75')).toBeNull()
  })
})

describe('isWithinTick', () => {
  it('(now-5, now] の幅だけ真', () => {
    expect(isWithinTick(600, 600)).toBe(true)
    expect(isWithinTick(596, 600)).toBe(true)
    expect(isWithinTick(595, 600)).toBe(false) // ちょうど 5 分前は前回の tick で送った
    expect(isWithinTick(601, 600)).toBe(false) // まだ先
  })
})

describe('selectDueToNotify', () => {
  it('締切時刻がその幅に入ったものを選ぶ', () => {
    const rows = [task({ id: 'a', due_time: '18:00' }), task({ id: 'b', due_time: '19:00' })]
    const picked = selectDueToNotify(rows, opts({ nowMinutes: 18 * 60 }))
    expect(picked.map((t) => t.id)).toEqual(['a'])
  })

  it('締切時刻が無いものは朝の計画の時刻にまとめる', () => {
    const rows = [task({ id: 'a' }), task({ id: 'b' })]
    expect(selectDueToNotify(rows, opts({ nowMinutes: 7 * 60, planTime: '07:00' })).map((t) => t.id))
      .toEqual(['a', 'b'])
    // 別の時刻では出さない
    expect(selectDueToNotify(rows, opts({ nowMinutes: 12 * 60, planTime: '07:00' }))).toEqual([])
  })

  it('朝の計画が未設定なら 9:00 にまとめる', () => {
    const rows = [task({ id: 'a' })]
    expect(DEFAULT_DUE_NOTIFY_MINUTES).toBe(540)
    expect(selectDueToNotify(rows, opts({ nowMinutes: 540 })).map((t) => t.id)).toEqual(['a'])
    expect(selectDueToNotify(rows, opts({ nowMinutes: 600 }))).toEqual([])
  })

  it('いつか / 買い物のリストは出さない', () => {
    const rows = [task({ id: 'a', due_time: '18:00', list_id: 'someday' })]
    const picked = selectDueToNotify(
      rows,
      opts({ nowMinutes: 18 * 60, excludedListIds: new Set(['someday']) }),
    )
    expect(picked).toEqual([])
  })

  it('その日に通知済みのものは二度出さない', () => {
    const rows = [task({ id: 'a', due_time: '18:00' })]
    const picked = selectDueToNotify(
      rows,
      opts({ nowMinutes: 18 * 60, notifiedIds: new Set(['a']) }),
    )
    expect(picked).toEqual([])
  })

  it('同じ時刻に重なったものはまとめて返す（呼び出し側で 1 通にする）', () => {
    const rows = [
      task({ id: 'a', due_time: '18:00' }),
      task({ id: 'b', due_time: '18:00' }),
      task({ id: 'c', due_time: '20:00' }),
    ]
    const picked = selectDueToNotify(rows, opts({ nowMinutes: 18 * 60 }))
    expect(picked.map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('壊れた締切時刻は既定の時刻として扱う（取りこぼさない）', () => {
    const rows = [task({ id: 'a', due_time: 'bogus' })]
    expect(selectDueToNotify(rows, opts({ nowMinutes: 540 })).map((t) => t.id)).toEqual(['a'])
  })
})
