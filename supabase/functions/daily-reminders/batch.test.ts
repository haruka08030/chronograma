import { describe, expect, it } from 'vitest'
import {
  CATCHUP_MAX_MINUTES,
  fetchAllPages,
  groupBy,
  isGoneStatus,
  PAGE_SIZE,
  runFinishPatch,
  runPool,
  runStatsPatch,
  runStatus,
  runWindowStart,
  sendJobs,
} from './batch.ts'
import { CRON_INTERVAL_MINUTES, remindersInWindow, wallMs, type ReminderTask } from './schedule.ts'

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
    const results = await runPool(
      Array.from({ length: 25 }, (_, i) => i),
      4,
      async (n) => {
        running++
        peak = Math.max(peak, running)
        await tick()
        running--
        return n * 2
      },
    )
    expect(peak).toBe(4)
    expect(results.map((r) => (r.status === 'fulfilled' ? r.value : null))).toEqual(Array.from({ length: 25 }, (_, i) => i * 2))
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
    expect(groupBy(subs, (s) => s.user)).toEqual([[subs[0], subs[2]], [subs[1]]])
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

describe('runStatus', () => {
  it('失敗が無ければ 200、1 つでもあれば 500', () => {
    expect(runStatus(0)).toBe(200)
    expect(runStatus(1)).toBe(500)
    expect(runStatus(12)).toBe(500)
  })
})

describe('runWindowStart', () => {
  const now = Date.parse('2026-10-06T10:00:00Z')
  const min = 60_000

  it('初めての回（記録なし）は 5 分前から', () => {
    expect(runWindowStart(null, now, CRON_INTERVAL_MINUTES)).toBe(now - 5 * min)
    expect(runWindowStart(undefined, now, CRON_INTERVAL_MINUTES)).toBe(now - 5 * min)
    expect(runWindowStart('not a date', now, CRON_INTERVAL_MINUTES)).toBe(now - 5 * min)
  })

  it('前の成功の回から今まで', () => {
    expect(runWindowStart('2026-10-06T09:55:00Z', now, CRON_INTERVAL_MINUTES)).toBe(now - 5 * min)
    expect(runWindowStart('2026-10-06T09:45:00Z', now, CRON_INTERVAL_MINUTES)).toBe(now - 15 * min)
  })

  it('60 分より前には戻らない', () => {
    expect(runWindowStart('2026-10-06T07:00:00Z', now, CRON_INTERVAL_MINUTES)).toBe(now - CATCHUP_MAX_MINUTES * min)
  })

  it('記録が今より先（時計のずれ）なら空の幅', () => {
    expect(runWindowStart('2026-10-06T10:03:00Z', now, CRON_INTERVAL_MINUTES)).toBe(now)
  })
})

describe('runFinishPatch', () => {
  it('全部うまくいった回だけ last_ok_at を進める。走っている目印はいつも外す', () => {
    expect(runFinishPatch(0, '2026-10-06T10:00:00.000Z')).toEqual({ running_since: null, last_ok_at: '2026-10-06T10:00:00.000Z' })
    expect(runFinishPatch(1, '2026-10-06T10:00:00.000Z')).toEqual({ running_since: null })
  })
})

describe('runStatsPatch', () => {
  const now = '2026-10-06T10:00:00.000Z'
  it('最後の回の数を残す。失敗の時刻は失敗があった回だけ進める', () => {
    expect(runStatsPatch({ checked: 12, sent: 3, removed: 1, failed: 0 }, now)).toEqual({
      last_run_at: now,
      last_checked: 12,
      last_sent: 3,
      last_removed: 1,
      last_failed: 0,
    })
    expect(runStatsPatch({ checked: 12, sent: 2, removed: 0, failed: 1 }, now)).toMatchObject({ last_failed: 1, last_failed_at: now })
  })
})

describe('失敗した回の取りこぼし', () => {
  // 1 人・タイムゾーン UTC（壁時計 = UTC）として、cron の回を順に動かす
  const s = { eventReminderMinutes: 10, dueReminders: false, recordPrompts: false }
  const tasks: ReminderTask[] = [
    { id: 'a', title: 'A', list_id: 'inbox', scheduled_date: '2026-10-06', start_time: '10:02' }, // 9:52 に鳴る
    { id: 'b', title: 'B', list_id: 'inbox', scheduled_date: '2026-10-06', start_time: '10:12' }, // 10:02 に鳴る
    { id: 'c', title: 'C', list_id: 'inbox', scheduled_date: '2026-10-06', start_time: '10:14' }, // 10:04 に鳴る
  ]
  const at = (time: string) => wallMs('2026-10-06', time)!

  /** index.ts と同じ流れ: 幅を決め、送った印にあるものを外して送り、成功なら last_ok_at を進める */
  const run = (
    state: { lastOk: string | null; sent: Set<string> },
    time: string,
    opts: { failReads?: boolean; failSend?: string } = {},
  ) => {
    const now = at(time)
    const from = runWindowStart(state.lastOk, now, CRON_INTERVAL_MINUTES)
    let failed = 0
    const delivered: string[] = []
    if (opts.failReads) failed++
    else {
      for (const r of remindersInWindow(tasks, s, from, now).filter((r) => !state.sent.has(r.key))) {
        if (r.taskId === opts.failSend) {
          failed++
          continue
        }
        delivered.push(r.taskId)
        state.sent.add(r.key)
      }
    }
    const patch = runFinishPatch(failed, new Date(now).toISOString())
    if (patch.last_ok_at) state.lastOk = patch.last_ok_at
    return delivered
  }

  it('読み込みに失敗した回の分は、次の回で送る', () => {
    const state = { lastOk: null as string | null, sent: new Set<string>() }
    expect(run(state, '09:50')).toEqual([])
    expect(run(state, '09:55', { failReads: true })).toEqual([]) // A（9:52）を取りこぼす
    expect(run(state, '10:00')).toEqual(['a'])
    expect(run(state, '10:05')).toEqual(['b', 'c'])
  })

  it('送れなかった 1 通は次の回にもう一度。送れたものは二重に送らない', () => {
    const state = { lastOk: '2026-10-06T09:55:00.000Z', sent: new Set<string>() }
    expect(run(state, '10:05', { failSend: 'b' })).toEqual(['c'])
    expect(state.lastOk).toBe('2026-10-06T09:55:00.000Z')
    expect(run(state, '10:10')).toEqual(['b'])
    expect(run(state, '10:15')).toEqual([])
  })

  it('何回も失敗が続いても、送り直すのは 60 分前の分まで', () => {
    const state = { lastOk: '2026-10-06T08:00:00.000Z', sent: new Set<string>() }
    // 9:52 の A は 60 分の幅（9:05〜10:05）に入る
    expect(run(state, '10:05')).toEqual(['a', 'b', 'c'])
    const late = { lastOk: '2026-10-06T08:00:00.000Z', sent: new Set<string>() }
    // 11:05 の回では A・B・C（9:52〜10:04）は 60 分より前なので送らない
    expect(run(late, '11:05')).toEqual([])
  })
})
