import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActiveTimer } from '../store/storeTypes'
import { fakeDb } from '../test/fakeSupabaseDb'
import { runSettingSync } from './settingSync'
import { activeTimerSyncDeps, normalizeActiveTimer, planActiveTimerSync, type ActiveTimerIo } from './timerSync'

vi.mock('./errorReport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./errorReport')>()),
  reportSyncError: vi.fn(),
}))

const timer = (taskTitle: string, startedAt: string, patch: Partial<ActiveTimer> = {}): ActiveTimer => ({
  taskTitle,
  startedAt,
  tags: [],
  taskId: null,
  color: null,
  ...patch,
})
const A = timer('ES', '2026-10-03T09:00:00.000Z')
const B = timer('英語', '2026-10-03T09:05:00.000Z')

describe('planActiveTimerSync', () => {
  it('サーバーに行が無ければ、手元を送る（止まっていても送って行を作る）', () => {
    expect(planActiveTimerSync({ timer: A, updatedAt: null }, null, 'now')).toEqual({ push: { timer: A, updatedAt: 'now', base: null } })
    expect(planActiveTimerSync({ timer: null, updatedAt: 't1', syncedAt: null }, null).push).toMatchObject({ timer: null, base: null })
  })

  it('手元で変えていなければ、他の端末のタイマーに合わせる（止めた・切り替えた記録はその端末が作る）', () => {
    expect(planActiveTimerSync({ timer: A, updatedAt: 'v1', syncedAt: 'v1' }, { timer: null, updatedAt: 'v2' })).toEqual({
      apply: { timer: null, updatedAt: 'v2' },
    })
    expect(planActiveTimerSync({ timer: null, updatedAt: 'v1', syncedAt: 'v1' }, { timer: B, updatedAt: 'v2' })).toEqual({
      apply: { timer: B, updatedAt: 'v2' },
    })
  })

  it('手元だけで変えたら、もとにした版を付けて送る', () => {
    expect(planActiveTimerSync({ timer: null, updatedAt: 't2', syncedAt: 'v1' }, { timer: A, updatedAt: 'v1' })).toEqual({
      push: { timer: null, updatedAt: 't2', base: 'v1' },
    })
  })

  it('両方で知らずに始めたら、後に始めたほうが勝ち、負けたほうは勝ったほうを始めた時刻までの記録にする', () => {
    // 手元が後: 送れたら（`onPushed`）サーバーのタイマーを記録にする
    expect(planActiveTimerSync({ timer: B, updatedAt: 't2', syncedAt: 'v0' }, { timer: A, updatedAt: 'v1' })).toEqual({
      push: { timer: B, updatedAt: 't2', base: 'v1', record: { timer: A, endedAt: B.startedAt } },
    })
    // サーバーが後: 合わせて、手元のタイマーを記録にする
    expect(planActiveTimerSync({ timer: A, updatedAt: 't2', syncedAt: 'v0' }, { timer: B, updatedAt: 'v1' })).toEqual({
      apply: { timer: B, updatedAt: 'v1', record: { timer: A, endedAt: B.startedAt } },
    })
  })

  it('同じ時刻に始めていたら、中身を並べて大きいほう（どちらの端末で比べても同じ答え）', () => {
    const x = timer('a', A.startedAt)
    const y = timer('b', A.startedAt)
    const onX = planActiveTimerSync({ timer: x, updatedAt: 't', syncedAt: 'v0' }, { timer: y, updatedAt: 'v1' })
    const onY = planActiveTimerSync({ timer: y, updatedAt: 't', syncedAt: 'v0' }, { timer: x, updatedAt: 'v1' })
    expect(onX.apply?.timer).toEqual(y)
    expect(onY.push?.timer).toEqual(y)
  })

  it('知らずに止めた側と、動いている側なら、動いているほう（見ていないタイマーを消さない）', () => {
    expect(planActiveTimerSync({ timer: null, updatedAt: 't2', syncedAt: 'v0' }, { timer: A, updatedAt: 'v1' })).toEqual({
      apply: { timer: A, updatedAt: 'v1' },
    })
    expect(planActiveTimerSync({ timer: A, updatedAt: 't2', syncedAt: 'v0' }, { timer: null, updatedAt: 'v1' })).toEqual({
      push: { timer: A, updatedAt: 't2', base: 'v1' },
    })
  })

  it('この端末でまだ一度も合わせていなければ: 同じならサーバーの版にそろえ、手元が止まっていればサーバーに合わせる', () => {
    const fromServer = { ...A, startedAt: '2026-10-03T09:00:00+00:00' }
    expect(planActiveTimerSync({ timer: A, updatedAt: null }, { timer: fromServer, updatedAt: 'v1' })).toEqual({
      apply: { timer: A, updatedAt: 'v1' },
    })
    expect(planActiveTimerSync({ timer: null, updatedAt: null }, { timer: A, updatedAt: 'v1' })).toEqual({
      apply: { timer: A, updatedAt: 'v1' },
    })
  })

  it('読んだタイマーをそろえる', () => {
    expect(normalizeActiveTimer({ taskTitle: 'x', startedAt: '2026-10-03T09:00:00+09:00', tags: ['a', 3] })).toEqual({
      taskTitle: 'x',
      startedAt: '2026-10-03T00:00:00.000Z',
      tags: ['a'],
      taskId: null,
      color: null,
    })
    expect(normalizeActiveTimer({ taskTitle: 'x', startedAt: 'bad' })).toBeNull()
    expect(normalizeActiveTimer(null)).toBeNull()
  })
})

/**
 * 2 台（PC・スマホ）を、同じサーバー（`fakeSupabaseDb`）と端末ごとの手元（タイマー・記録・もとにした版）で回す。
 * もとにした版は端末ごとに別の場所に覚える（`runSettingSync` に端末の名前を渡す。同じ利用者でも端末は別の localStorage）
 */
describe('2 台の動いているタイマー（#301）', () => {
  let db: ReturnType<typeof fakeDb>

  beforeEach(() => {
    db = fakeDb()
    const mem = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    })
  })

  type Log = { title: string; startedAt: string; endedAt: string }
  function device(name: string) {
    const st = { timer: null as ActiveTimer | null, updatedAt: null as string | null, logs: [] as Log[] }
    const io: ActiveTimerIo = {
      read: () => ({ timer: st.timer, updatedAt: st.updatedAt }),
      apply: (t, at) => {
        st.timer = t
        st.updatedAt = at
      },
      setUpdatedAt: (at) => {
        st.updatedAt = at
      },
      record: ({ timer: t, endedAt }) => st.logs.push({ title: t.taskTitle, startedAt: t.startedAt, endedAt }),
    }
    const d = {
      st,
      /** ▶（動いていれば記録にして切り替える。`startTimer` と同じ） */
      start(title: string, at: string) {
        if (st.timer) d.stop(at)
        st.timer = timer(title, at)
        st.updatedAt = at
      },
      /** ■（記録を作る。`stopTimer` と同じ） */
      stop(at: string) {
        if (st.timer) st.logs.push({ title: st.timer.taskTitle, startedAt: st.timer.startedAt, endedAt: at })
        st.timer = null
        st.updatedAt = at
      },
      sync: () => runSettingSync(name, activeTimerSyncDeps(db.client, 'u1', io)),
    }
    return d
  }
  const row = () => db.tables.user_active_timer?.find((r) => r.user_id === 'u1')

  it('PC で始めたタイマーがスマホに出て、スマホで止めると記録は 1 本だけ、PC からも消える', async () => {
    const pc = device('pc')
    const phone = device('phone')
    await pc.sync()
    await phone.sync()

    pc.start('ES', A.startedAt)
    await pc.sync()
    expect(row()).toMatchObject({ started_at: A.startedAt, task_title: 'ES' })

    await phone.sync()
    expect(phone.st.timer).toEqual(A)

    phone.stop('2026-10-03T10:00:00.000Z')
    await phone.sync()
    expect(row()).toMatchObject({ started_at: null, task_title: null })

    await pc.sync()
    expect(pc.st.timer).toBeNull()
    expect([...pc.st.logs, ...phone.st.logs]).toEqual([{ title: 'ES', startedAt: A.startedAt, endedAt: '2026-10-03T10:00:00.000Z' }])
  })

  it('PC で動いているのを知らずにスマホで ▶: 後に始めたスマホのタイマーが残り、PC のタイマーはスマホを始めた時刻までの記録 1 本になる', async () => {
    const pc = device('pc')
    const phone = device('phone')
    await pc.sync()
    await phone.sync()

    pc.start('ES', A.startedAt)
    await pc.sync()
    // スマホはまだ取り込んでいない
    phone.start('英語', B.startedAt)
    await phone.sync()
    await pc.sync()

    expect(pc.st.timer).toEqual(B)
    expect(phone.st.timer).toEqual(B)
    expect(row()).toMatchObject({ task_title: '英語' })
    // 記録を作ったのは食い違いに気づいたスマホだけ
    expect(phone.st.logs).toEqual([{ title: 'ES', startedAt: A.startedAt, endedAt: B.startedAt }])
    expect(pc.st.logs).toEqual([])
  })

  it('送る順が逆（後に始めたほうが先に送った）でも、残るタイマーと記録は同じ', async () => {
    const pc = device('pc')
    const phone = device('phone')
    await pc.sync()
    await phone.sync()

    pc.start('ES', A.startedAt)
    phone.start('英語', B.startedAt)
    await phone.sync()
    await pc.sync()
    await phone.sync()

    expect(pc.st.timer).toEqual(B)
    expect(phone.st.timer).toEqual(B)
    expect(pc.st.logs).toEqual([{ title: 'ES', startedAt: A.startedAt, endedAt: B.startedAt }])
    expect(phone.st.logs).toEqual([])
  })

  it('スマホで短く動かして止めても、知らなかった PC のタイマーは消さない', async () => {
    const pc = device('pc')
    const phone = device('phone')
    await pc.sync()
    await phone.sync()

    pc.start('ES', A.startedAt)
    await pc.sync()
    phone.start('英語', B.startedAt)
    phone.stop('2026-10-03T09:30:00.000Z')
    await phone.sync()

    expect(phone.st.timer).toEqual(A)
    expect(row()).toMatchObject({ task_title: 'ES' })
    expect(phone.st.logs.map((l) => l.title)).toEqual(['英語'])
  })

  it('送る直前に他の端末が止めたら、取り直して合わせ、止められたタイマーを二重に記録しない', async () => {
    const pc = device('pc')
    const phone = device('phone')
    await pc.sync()
    await phone.sync()

    phone.start('ES', A.startedAt)
    await phone.sync()
    // PC は ES を知らずに英語を始め、ES を記録にして英語を送ろうとする。その直前にスマホが ES を止めて記録にした
    pc.start('英語', B.startedAt)
    let interfered = false
    db.hooks.beforeUpsert = () => {
      if (interfered) return
      interfered = true
      const r = row()!
      Object.assign(r, { started_at: null, task_title: null, updated_at: '2026-10-03T00:00:00.100000+00:00' })
      phone.st.logs.push({ title: 'ES', startedAt: A.startedAt, endedAt: '2026-10-03T09:04:00.000Z' })
    }
    await pc.sync()

    expect(interfered).toBe(true)
    expect(row()).toMatchObject({ task_title: '英語' })
    expect([...pc.st.logs, ...phone.st.logs].filter((l) => l.title === 'ES')).toHaveLength(1)
    expect(pc.st.logs).toEqual([])
  })

  it('前の版から動いていたタイマー（まだ一度も同期していない）は送ってほかの端末に出す', async () => {
    const pc = device('pc')
    pc.st.timer = A
    await pc.sync()
    expect(row()).toMatchObject({ started_at: A.startedAt })
    const phone = device('phone')
    await phone.sync()
    expect(phone.st.timer).toEqual(A)
  })
})
