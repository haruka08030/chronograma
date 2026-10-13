import { describe, expect, it, vi } from 'vitest'
import {
  cleanMoodNote,
  createDayMoodPullState,
  normalizeDayMoods,
  planDayMoodSync,
  runDayMoodSync,
  type DayMood,
  type DayMoodPush,
  type DayMoods,
  type RemoteDayMood,
} from './dayMood'

vi.mock('./errorReport', () => ({ reportSyncError: vi.fn() }))

const S1 = '2026-10-07T12:00:00.000001+00:00'
const S2 = '2026-10-08T12:00:00.000002+00:00'
const synced = (mood: DayMood['mood'], note = '', at = S1): DayMood => ({ mood, note, updatedAt: at, syncedAt: at })
const edited = (mood: DayMood['mood'], note = '', syncedAt: string | null = S1, at = '2026-10-08T13:00:00.000Z'): DayMood => ({
  mood,
  note,
  updatedAt: at,
  syncedAt,
})
const remote = (day: string, mood: RemoteDayMood['mood'], note = '', updatedAt = S2): RemoteDayMood => ({ day, mood, note, updatedAt })

describe('normalizeDayMoods', () => {
  it('日付・時刻が読めない日は外し、気分は 1〜5 だけ', () => {
    expect(
      normalizeDayMoods({
        '2026-10-08': { mood: 4, note: 'よし', updatedAt: S1, syncedAt: S1 },
        '2026-10-07': { mood: 9, note: 3, updatedAt: S1 },
        bad: { mood: 1, note: '', updatedAt: S1 },
        '2026-10-06': { mood: 1, note: '' },
      }),
    ).toEqual({
      '2026-10-08': { mood: 4, note: 'よし', updatedAt: S1, syncedAt: S1 },
      '2026-10-07': { mood: null, note: '', updatedAt: S1, syncedAt: null },
    })
    expect(normalizeDayMoods(null)).toEqual({})
    expect(normalizeDayMoods([1])).toEqual({})
  })

  it('一言は 1 行・前後の空白なし・140 字まで', () => {
    expect(cleanMoodNote('  よく\n寝た  ')).toBe('よく 寝た')
    expect(cleanMoodNote('あ'.repeat(200))).toHaveLength(140)
  })
})

describe('planDayMoodSync', () => {
  it('サーバーにしか無い日は手元に入れる', () => {
    const plan = planDayMoodSync({}, [remote('2026-10-08', 3, 'ふつう')])
    expect(plan.apply).toEqual({ '2026-10-08': { mood: 3, note: 'ふつう', updatedAt: S2, syncedAt: S2 } })
    expect(plan.push).toEqual([])
  })

  it('手元だけで変えた日は、もとにした版で送る（取得に無ければ変わっていないとみる）', () => {
    const local: DayMoods = { '2026-10-08': edited(5, 'いい日'), '2026-10-07': synced(2) }
    const plan = planDayMoodSync(local, [])
    expect(plan.push).toEqual([{ day: '2026-10-08', mood: 5, note: 'いい日', updatedAt: local['2026-10-08']!.updatedAt, base: S1 }])
  })

  it('まだ一度も合わせていない日（ログインする前に付けた）は、行が無いはずとして送る', () => {
    const plan = planDayMoodSync({ '2026-10-08': edited(4, '', null) }, [])
    expect(plan.push.map((p) => p.base)).toEqual([null])
  })

  it('サーバーだけで変わった日は合わせ、中身が同じなら版だけそろえる', () => {
    const plan = planDayMoodSync({ '2026-10-08': synced(2), '2026-10-07': edited(4, '', S1) }, [
      remote('2026-10-08', 1),
      remote('2026-10-07', 4),
    ])
    expect(plan.apply['2026-10-08']).toEqual({ mood: 1, note: '', updatedAt: S2, syncedAt: S2 })
    expect(plan.adopt).toEqual({ '2026-10-07': S2 })
    expect(plan.push).toEqual([])
  })

  it('両方で変えた日は新しいほう（手元の時刻はサーバーの時計に直して比べる）', () => {
    const newer = { '2026-10-08': edited(5, '', S1, '2026-10-08T13:00:00.000Z') }
    expect(planDayMoodSync(newer, [remote('2026-10-08', 1)]).push.map((p: DayMoodPush) => [p.mood, p.base])).toEqual([[5, S2]])
    const older = { '2026-10-08': edited(5, '', S1, '2026-10-08T11:00:00.000Z') }
    expect(planDayMoodSync(older, [remote('2026-10-08', 1)]).apply['2026-10-08']?.mood).toBe(1)
    // 端末の時計が 2 時間遅れていると分かっていれば、直すと手元のほうが新しい
    expect(planDayMoodSync(older, [remote('2026-10-08', 1)], 2 * 3600_000).push).toHaveLength(1)
  })
})

describe('runDayMoodSync', () => {
  /** サーバーの真似（版は呼ぶたびに進む） */
  function fakeServer(rows: RemoteDayMood[] = []) {
    let n = 10
    const stamp = () => `2026-10-08T20:00:00.0000${n++}+00:00`
    const fetches: (string | null)[] = []
    let local: DayMoods = {}
    const server = new Map(rows.map((r) => [r.day, r]))
    const io = {
      fetch: vi.fn(async (since: string | null) => {
        fetches.push(since)
        return [...server.values()].filter((r) => since === null || Date.parse(r.updatedAt) > Date.parse(since))
      }),
      push: vi.fn(async (ps: DayMoodPush[]) => {
        const written: { day: string; updatedAt: string }[] = []
        for (const p of ps) {
          const cur = server.get(p.day)
          if (cur ? cur.updatedAt !== p.base : false) continue
          const at = stamp()
          server.set(p.day, { day: p.day, mood: p.mood, note: p.note, updatedAt: at })
          written.push({ day: p.day, updatedAt: at })
        }
        return { written }
      }),
      get: () => local,
      set: (next: DayMoods) => {
        local = next
      },
    }
    return { io, server, fetches, stamp, setLocal: (m: DayMoods) => (local = m), local: () => local }
  }

  it('送れたら手元の時刻と版をサーバーの版にし、次は差分だけを取る', async () => {
    const f = fakeServer()
    f.setLocal({ '2026-10-08': edited(4, 'よし', null) })
    const state = createDayMoodPullState()
    await runDayMoodSync(f.io, state)
    const at = f.server.get('2026-10-08')!.updatedAt
    expect(f.local()['2026-10-08']).toEqual({ mood: 4, note: 'よし', updatedAt: at, syncedAt: at })
    await runDayMoodSync(f.io, state)
    expect(f.fetches[0]).toBeNull()
    expect(f.fetches[1]).not.toBeNull()
    expect(f.io.push).toHaveBeenCalledTimes(1)
  })

  it('取得した後に他の端末が変えていて断られたら、全部を取り直して合わせ直す', async () => {
    const f = fakeServer([remote('2026-10-08', 2, '', S1)])
    f.setLocal({ '2026-10-08': synced(2, '', S1) })
    const state = createDayMoodPullState()
    await runDayMoodSync(f.io, state)
    // 手元で変えた。同時に別の端末も変えた（差分の目印より前の版を付けた行として残る）
    f.setLocal({ '2026-10-08': edited(5, '', S1, '2026-10-08T23:00:00.000Z') })
    f.io.fetch.mockImplementationOnce(async () => {
      f.server.set('2026-10-08', remote('2026-10-08', 1, '', f.stamp()))
      return []
    })
    await runDayMoodSync(f.io, state)
    // 断られた → 全部を取り直す → 手元の編集のほうが新しいので、取り直した版で送り直す
    expect(f.fetches.at(-1)).toBeNull()
    expect(f.server.get('2026-10-08')!.mood).toBe(5)
    expect(f.local()['2026-10-08']!.syncedAt).toBe(f.server.get('2026-10-08')!.updatedAt)
  })

  it('送っている間に手元で変えたら、版だけ受け取って手元の時刻はそのまま（次に送る）', async () => {
    const f = fakeServer()
    f.setLocal({ '2026-10-08': edited(3, '', null) })
    const push = f.io.push.getMockImplementation()!
    f.io.push.mockImplementationOnce(async (ps) => {
      const res = await push(ps)
      f.setLocal({ '2026-10-08': { ...f.local()['2026-10-08']!, mood: 4, updatedAt: '2026-10-08T23:59:00.000Z' } })
      return res
    })
    await runDayMoodSync(f.io, createDayMoodPullState())
    const m = f.local()['2026-10-08']!
    expect(m.mood).toBe(4)
    expect(m.syncedAt).toBe(f.server.get('2026-10-08')!.updatedAt)
    expect(m.updatedAt).not.toBe(m.syncedAt)
  })

  it('取れない（表がまだ無いなど）ときは手元を変えずに終わる', async () => {
    const f = fakeServer()
    f.setLocal({ '2026-10-08': edited(3, '', null) })
    f.io.fetch.mockResolvedValueOnce({ error: 'missing' } as never)
    await runDayMoodSync(f.io, createDayMoodPullState())
    expect(f.io.push).not.toHaveBeenCalled()
    expect(f.local()['2026-10-08']!.syncedAt).toBeNull()
  })
})
