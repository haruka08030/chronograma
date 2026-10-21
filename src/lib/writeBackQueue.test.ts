// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { retryDelayMs, writeBackQueue } from './writeBackQueue'

const KEY = 'chronograma-writeback-v1:test:u1'
const T0 = Date.parse('2026-10-19T00:00:00Z')

beforeEach(() => localStorage.clear())

describe('writeBackQueue', () => {
  it('積んだものはすぐ送ってよく、送れたら外す', () => {
    const q = writeBackQueue<{ n: number }>(KEY)
    q.put('a', { n: 1 }, T0)
    expect(q.due(T0).map(([id, e]) => [id, e.payload])).toEqual([['a', { n: 1 }]])
    q.done('a')
    expect(q.all(T0)).toEqual([])
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('失敗するたびに間隔を倍にあけ、積み直すと 0 回に戻る', () => {
    const q = writeBackQueue<null>(KEY)
    q.put('a', null, T0)
    q.fail('a', T0)
    expect(q.due(T0)).toEqual([])
    expect(q.nextDueAt(T0)).toBe(T0 + retryDelayMs(1))
    q.fail('a', T0)
    expect(q.nextDueAt(T0)).toBe(T0 + retryDelayMs(2))
    expect(retryDelayMs(2)).toBe(2 * retryDelayMs(1))
    expect(retryDelayMs(50)).toBe(60 * 60_000)
    q.put('a', null, T0)
    expect(q.due(T0)).toHaveLength(1)
  })

  it('ほかのタブ（同じ保存先）と分け合い、7 日より古いものは捨てる', () => {
    writeBackQueue<null>(KEY).put('a', null, T0)
    const other = writeBackQueue<null>(KEY)
    expect(other.all(T0).map(([id]) => id)).toEqual(['a'])
    expect(other.all(T0 + 8 * 86_400_000)).toEqual([])
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('壊れた保存内容は空として扱う', () => {
    localStorage.setItem(KEY, '{not json')
    expect(writeBackQueue<null>(KEY).all(T0)).toEqual([])
  })
})
