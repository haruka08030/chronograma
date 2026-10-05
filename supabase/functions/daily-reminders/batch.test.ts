import { describe, expect, it } from 'vitest'
import { fetchAllPages, groupBy, isGoneStatus, PAGE_SIZE, runPool, sendJobs } from './batch.ts'

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('fetchAllPages', () => {
  it('1000 行を超える購読もページをまたいで全部読む', async () => {
    const rows = Array.from({ length: 2345 }, (_, i) => i)
    const calls: [number, number][] = []
    const all = await fetchAllPages(async (from, to) => {
      calls.push([from, to])
      return rows.slice(from, to + 1)
    })
    expect(all).toEqual(rows)
    expect(calls).toEqual([
      [0, PAGE_SIZE - 1],
      [PAGE_SIZE, 2 * PAGE_SIZE - 1],
      [2 * PAGE_SIZE, 3 * PAGE_SIZE - 1],
    ])
  })

  it('ちょうどページの大きさの倍数なら、空のページを読んで終わる', async () => {
    const rows = Array.from({ length: 6 }, (_, i) => i)
    let calls = 0
    const all = await fetchAllPages(async (from, to) => {
      calls++
      return rows.slice(from, to + 1)
    }, 3)
    expect(all).toEqual(rows)
    expect(calls).toBe(3)
  })

  it('ページの読み込みに失敗したら途中で止めて投げる', async () => {
    await expect(
      fetchAllPages(async (from) => {
        if (from > 0) throw new Error('db down')
        return [1, 2, 3]
      }, 3),
    ).rejects.toThrow('db down')
  })
})

describe('runPool', () => {
  it('同時に走るのは上限の数まで', async () => {
    let running = 0
    let peak = 0
    const results = await runPool(Array.from({ length: 25 }, (_, i) => i), 4, async (n) => {
      running++
      peak = Math.max(peak, running)
      await tick()
      running--
      return n * 2
    })
    expect(peak).toBe(4)
    expect(results.map((r) => (r.status === 'fulfilled' ? r.value : null))).toEqual(
      Array.from({ length: 25 }, (_, i) => i * 2),
    )
  })

  it('1 つが失敗してもほかは全部処理する', async () => {
    const done: number[] = []
    const results = await runPool([1, 2, 3, 4, 5], 2, async (n) => {
      await tick()
      if (n === 2) throw new Error('boom')
      done.push(n)
      return n
    })
    expect(done.sort()).toEqual([1, 3, 4, 5])
    expect(results[1]).toMatchObject({ status: 'rejected' })
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(4)
  })

  it('空なら何もしない', async () => {
    expect(await runPool([], 10, async () => 1)).toEqual([])
  })
})

describe('groupBy', () => {
  it('同じ利用者の端末をまとめる（出てきた順）', () => {
    const subs = [
      { user: 'a', e: 1 },
      { user: 'b', e: 2 },
      { user: 'a', e: 3 },
    ]
    expect(groupBy(subs, (s) => s.user)).toEqual([
      [subs[0], subs[2]],
      [subs[1]],
    ])
  })
})

describe('sendJobs', () => {
  const fail = (statusCode?: number) => Object.assign(new Error('push failed'), { statusCode })

  it('1 通の失敗でほかの通知は止めない', async () => {
    const out = await sendJobs(['a', 'b', 'c'], async (j) => {
      if (j === 'b') throw fail(500)
    })
    expect(out.delivered).toEqual(['a', 'c'])
    expect(out.gone).toBe(false)
    expect(out.failed.map((f) => f.job)).toEqual(['b'])
  })

  it('404 / 410 は購読の失効として知らせる', async () => {
    const out = await sendJobs(['a', 'b'], async () => {
      throw fail(410)
    })
    expect(out).toEqual({ delivered: [], gone: true, failed: [] })
    expect(isGoneStatus(fail(404))).toBe(true)
    expect(isGoneStatus(fail(429))).toBe(false)
    expect(isGoneStatus(new Error('timeout'))).toBe(false)
  })

  it('並べて送る（前の送信を待たない）', async () => {
    let running = 0
    let peak = 0
    await sendJobs([1, 2, 3], async () => {
      running++
      peak = Math.max(peak, running)
      await tick()
      running--
    })
    expect(peak).toBe(3)
  })
})
