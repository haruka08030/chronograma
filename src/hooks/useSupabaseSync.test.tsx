import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { loadBaseline, saveBaseline } from '../lib/syncMerge'
import { fakeDb, inboxRow, taskRow } from '../test/fakeSupabaseDb'
import { clearLocalAccountState, isAccountGone } from '../lib/accountBoundary'
import { backupNow } from './useAutoBackup'
import i18n from '../i18n/config'
import { flushPendingSync, useSupabaseSync } from './useSupabaseSync'

/**
 * 同期のフックを、本物のストアと PostgREST・DB の偽物（`fakeSupabaseDb`、サーバーのトリガーと印を真似る）で回す。
 * ログインしている人と Supabase の接続だけ差し替える
 */
const env = vi.hoisted(() => ({
  client: null as unknown,
  user: null as { id: string } | null,
}))

vi.mock('../lib/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/supabase')>()),
  getSupabase: () => env.client,
}))
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: env.user, loading: false }),
}))
// エラーの送信と自動バックアップ（IndexedDB）はここでは見ない
vi.mock('../lib/errorReport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/errorReport')>()),
  reportSyncError: vi.fn(),
}))
vi.mock('./useAutoBackup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./useAutoBackup')>()),
  backupNow: vi.fn(),
}))

// 通知の購読（Service Worker）は jsdom に無いので、外したか・購読し直したかだけ見る
const push = vi.hoisted(() => ({ detach: vi.fn(async () => {}), resync: vi.fn(async () => {}) }))
vi.mock('../lib/webPush', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/webPush')>()),
  detachWebPush: push.detach,
  resyncWebPush: push.resync,
}))

// ログインする前のデータをアカウントに入れるかの確認（既定は「入れる」）
const confirm = vi.hoisted(() => ({ ask: vi.fn<(o: { message: string; confirmLabel?: string }) => Promise<boolean>>(async () => true) }))
vi.mock('../lib/confirmDialog', () => ({ askConfirm: confirm.ask }))

let db: ReturnType<typeof fakeDb>

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-03T09:00:00.000Z'))
  db = fakeDb()
  env.client = db.client
  env.user = null
  push.detach.mockClear()
  push.resync.mockClear()
  confirm.ask.mockReset()
  confirm.ask.mockResolvedValue(true)
  vi.mocked(backupNow).mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

/** 同期が 1 回終わるまで（最後に同期した時刻が変わるまで）進める。待ち時間の予約（1.8 秒・60 秒）には届かない */
async function untilSynced(before = useTaskStore.getState().lastSyncedAt) {
  for (let i = 0; i < 200; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    const s = useTaskStore.getState()
    if (s.lastSyncedAt !== before && s.syncState === 'idle') return
  }
  throw new Error(`sync did not finish (state: ${useTaskStore.getState().syncState})`)
}

const storeTitles = () =>
  useTaskStore
    .getState()
    .tasks.map((t) => t.title)
    .sort()
const serverTitles = (userId: string) =>
  db.tables
    .tasks!.filter((r) => r.user_id === userId)
    .map((r) => String(r.title))
    .sort()

function signIn(userId: string) {
  env.user = { id: userId }
  db.auth.user = userId
  return renderHook(() => useSupabaseSync())
}

describe('useSupabaseSync', () => {
  it('この端末で初めての同期: 手元のタスクとアカウントのタスクを両方残し、手元の分を送る', async () => {
    db.tables.lists!.push({ ...inboxRow })
    db.tables.tasks!.push(taskRow('r1', { title: 'from account' }))
    // ログインする前にこの端末で作ったタスク（持ち主はまだいない）
    useTaskStore.getState().addTask('made offline')
    expect(useTaskStore.getState().dataOwner).toBeNull()

    signIn('u1')
    await untilSynced()

    // アカウントにもデータがあるので、送る前に確かめた
    expect(confirm.ask).toHaveBeenCalledTimes(1)
    expect(confirm.ask.mock.calls[0]![0].confirmLabel).toBe(i18n.t('sync.mergeLocalConfirm', { count: 1 }))
    expect(storeTitles()).toEqual(['from account', 'made offline'])
    expect(serverTitles('u1')).toEqual(['from account', 'made offline'])
    const s = useTaskStore.getState()
    expect(s.dataOwner).toBe('u1')
    // 前回同期の控えに両方が入る（次の同期で片方を「消された」と読まない）
    const baseline = loadBaseline('u1')!
    expect(Object.keys(baseline.tasks).sort()).toEqual(s.tasks.map((t) => t.id).sort())
    // 受信箱は重ねて作らない
    expect(s.lists.filter((l) => l.id === '__inbox__')).toHaveLength(1)
    expect(db.tables.lists!.filter((r) => r.user_id === 'u1' && r.id === '__inbox__')).toHaveLength(1)
  })

  describe('ログインする前のデータ（#341）', () => {
    it('入れないと答えたら、アカウントに送らず控えに残し、手元はアカウントの内容だけにする', async () => {
      db.tables.lists!.push({ ...inboxRow })
      db.tables.tasks!.push(taskRow('r1', { title: 'from account' }))
      useTaskStore.getState().addTask('someone else offline')
      useTaskStore.setState({ timeLogTagPresets: ['A社 面接'] })
      confirm.ask.mockResolvedValue(false)

      signIn('u1')
      await untilSynced()

      expect(confirm.ask).toHaveBeenCalledTimes(1)
      expect(storeTitles()).toEqual(['from account'])
      expect(serverTitles('u1')).toEqual(['from account'])
      // 持ち主のいない控え（ログアウトすると自動バックアップに出る）
      expect(backupNow).toHaveBeenCalledWith('beforeSignIn', null)
      expect(useTaskStore.getState().timeLogTagPresets).not.toContain('A社 面接')
      expect(useTaskStore.getState().dataOwner).toBe('u1')
      expect(Object.keys(loadBaseline('u1')!.tasks)).toEqual(['r1'])

      // 次の同期でも聞き直さず、送らない
      window.dispatchEvent(new Event('online'))
      await untilSynced()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000)
      })
      expect(confirm.ask).toHaveBeenCalledTimes(1)
      expect(serverTitles('u1')).toEqual(['from account'])
      expect((db.tables.user_settings ?? []).flatMap((r) => (r.log_labels as { name: string }[]).map((l) => l.name))).not.toContain(
        'A社 面接',
      )
    })

    it('アカウントが空なら聞かずに送る', async () => {
      useTaskStore.getState().addTask('made offline')

      signIn('u1')
      await untilSynced()

      expect(confirm.ask).not.toHaveBeenCalled()
      expect(serverTitles('u1')).toEqual(['made offline'])
    })

    it('この人のデータ（前回同期の控えが無いだけ）なら聞かない', async () => {
      db.tables.lists!.push({ ...inboxRow })
      db.tables.tasks!.push(taskRow('r1', { title: 'from account' }))
      useTaskStore.getState().addTask('mine')
      useTaskStore.getState().setDataOwner('u1')

      signIn('u1')
      await untilSynced()

      expect(confirm.ask).not.toHaveBeenCalled()
      expect(serverTitles('u1')).toEqual(['from account', 'mine'])
    })
  })

  describe('別の端末でアカウントが消されたとき（#341）', () => {
    const beforeSignOutBackups = () => vi.mocked(backupNow).mock.calls.filter(([kind]) => kind !== 'daily')

    it('送った行が外部キーで断られたら、アカウントが無いと確かめて控えを取らずに消し、「送れません」を出さない', async () => {
      db.tables.lists!.push({ ...inboxRow })
      db.tables.tasks!.push(taskRow('a', { title: 'a' }))
      const hook = signIn('u1')
      await untilSynced()
      expect(storeTitles()).toEqual(['a'])

      db.deleteUser('u1')
      useTaskStore.getState().addTask('new here')
      for (let i = 0; i < 100 && db.auth.signOuts === 0; i++) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(100)
        })
      }

      expect(db.auth.signOuts).toBe(1)
      const s = useTaskStore.getState()
      expect(s.tasks).toEqual([])
      expect(s.syncRejected).toEqual([])
      expect(s.dataOwner).toBeNull()
      expect(loadBaseline('u1')).toBeNull()
      expect(beforeSignOutBackups()).toEqual([])

      // この後の SIGNED_OUT の片付けでも控えを取らない
      env.user = null
      hook.rerender()
      useTaskStore.getState().addTask('left over')
      clearLocalAccountState('u1')
      expect(useTaskStore.getState().tasks).toEqual([])
      expect(beforeSignOutBackups()).toEqual([])
    })

    it('開き直したときにサーバーが空なら確かめ、アカウントが無ければ合わせずに消す（同期の直前の控えも取らない）', async () => {
      db.tables.lists!.push({ ...inboxRow })
      db.tables.tasks!.push(taskRow('a', { title: 'a' }))
      const first = signIn('u1')
      await untilSynced()
      first.unmount()

      db.deleteUser('u1')
      signIn('u1')
      for (let i = 0; i < 100 && db.auth.signOuts === 0; i++) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(10)
        })
      }

      expect(db.auth.signOuts).toBe(1)
      expect(useTaskStore.getState().tasks).toEqual([])
      expect(loadBaseline('u1')).toBeNull()
      expect(beforeSignOutBackups()).toEqual([])
    })

    it('アカウントがあれば、サーバーが空でも消さない', async () => {
      db.tables.lists!.push({ ...inboxRow })
      db.tables.tasks!.push(taskRow('a', { title: 'a' }))
      const first = signIn('u1')
      await untilSynced()
      first.unmount()

      // 他の端末が全部消した（アカウントは残っている）
      await db.client.from('tasks').delete().eq('user_id', 'u1').in('id', ['a'])
      await db.client.from('lists').delete().eq('user_id', 'u1').in('id', ['__inbox__'])
      signIn('u1')
      await untilSynced()

      expect(db.auth.signOuts).toBe(0)
      expect(useTaskStore.getState().dataOwner).toBe('u1')
    })

    it('isAccountGone は「ユーザーがいない」のときだけ true。答えが無ければ false', async () => {
      db.auth.user = 'u1'
      expect(await isAccountGone(db.client)).toBe(false)
      db.deleteUser('u1')
      expect(await isAccountGone(db.client)).toBe(true)
      const hanging = { auth: { getUser: () => new Promise(() => {}) } } as unknown as typeof db.client
      const answer = isAccountGone(hanging)
      await vi.advanceTimersByTimeAsync(3_000)
      expect(await answer).toBe(false)
    })
  })

  it('アカウントにデータがあれば、初めての同期ではじめの案内を終わらせる', async () => {
    db.tables.lists!.push({ ...inboxRow })
    db.tables.tasks!.push(taskRow('r1'))
    expect(useTaskStore.getState().onboardingDone).toBe(false)

    signIn('u1')
    await untilSynced()

    expect(useTaskStore.getState().onboardingDone).toBe(true)
  })

  it('アカウントが空なら、はじめの案内は出したまま', async () => {
    signIn('u1')
    await untilSynced()

    expect(useTaskStore.getState().dataOwner).toBe('u1')
    expect(useTaskStore.getState().onboardingDone).toBe(false)
  })

  it('別の人に替わったら、前の人のデータを手元にも次の人のアカウントにも残さない', async () => {
    db.tables.lists!.push({ ...inboxRow }, { ...inboxRow, user_id: 'u2' })
    db.tables.tasks!.push(taskRow('a1', { title: 'u1 task' }), taskRow('b1', { user_id: 'u2', title: 'u2 task' }))

    env.user = { id: 'u1' }
    const hook = renderHook(() => useSupabaseSync())
    await untilSynced()
    useTaskStore.getState().addTask('u1 local')
    expect(storeTitles()).toEqual(['u1 local', 'u1 task'])

    // ログアウト（送る前に）→ 端末の後片付けを通らずに別の人でログイン
    env.user = null
    hook.rerender()
    expect(useTaskStore.getState().syncState).toBe('idle')
    env.user = { id: 'u2' }
    hook.rerender()
    await untilSynced()

    expect(storeTitles()).toEqual(['u2 task'])
    expect(useTaskStore.getState().dataOwner).toBe('u2')
    expect(serverTitles('u2')).toEqual(['u2 task'])
    // 前の人のアカウントもそのまま（ログアウトの後は送らない）
    expect(serverTitles('u1')).toEqual(['u1 task'])
    // 待ち時間が過ぎても、前の人のデータを送らない
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })
    expect(serverTitles('u2')).toEqual(['u2 task'])
    expect(serverTitles('u1')).toEqual(['u1 task'])
  })

  it('2 回目は差分だけを取り、他の端末で消された行を消えた印から外す', async () => {
    db.tables.lists!.push({ ...inboxRow })
    db.tables.tasks!.push(taskRow('a', { title: 'keep' }), taskRow('b', { title: 'gone elsewhere' }))
    signIn('u1')
    await untilSynced()
    expect(storeTitles()).toEqual(['gone elsewhere', 'keep'])
    expect(db.fullFetches()).toBe(1)

    // 他の端末が b を消す（サーバーに消えた印が残る）
    await db.client.from('tasks').delete().eq('user_id', 'u1').in('id', ['b'])
    expect(db.tables.sync_tombstones!.map((t) => t.row_id)).toEqual(['b'])

    // 回線が戻ったとき（ほかに見えている間の 60 秒ごと・画面に戻ったときも同じ同期）
    db.selects.length = 0
    window.dispatchEvent(new Event('online'))
    await untilSynced()

    expect(db.fullFetches()).toBe(0)
    expect(db.selects.some((x) => x.table === 'tasks' && x.since)).toBe(true)
    expect(storeTitles()).toEqual(['keep'])
    expect(Object.keys(loadBaseline('u1')!.tasks)).toEqual(['a'])
    // 消された行を送り直さない
    expect(serverTitles('u1')).toEqual(['keep'])
  })

  it('編集は待ち時間の後に送る。取得の後に他の端末が変えて断られたら、次は全部を取り直して合わせる', async () => {
    db.tables.lists!.push({ ...inboxRow })
    db.tables.tasks!.push(taskRow('a', { title: 'a' }), taskRow('b', { title: 'b' }))
    signIn('u1')
    await untilSynced()

    useTaskStore.getState().updateTask('a', { title: 'a edited here' })
    // 待ち時間（1.8 秒）の前は送らない
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })
    expect(serverTitles('u1')).toEqual(['a', 'b'])

    // 取得した後・送る前に、他の端末が a を変える（この端末の送信は版が合わず断られる）
    let interfered = false
    db.hooks.beforeUpsert = (table) => {
      if (table !== 'tasks' || interfered) return
      interfered = true
      db.oldClientWrite('tasks', {
        ...db.tables.tasks!.find((r) => r.id === 'a')!,
        priority: 'high',
        updated_at: '2026-10-03T08:59:00.000000+00:00',
      })
    }
    db.selects.length = 0
    const before = useTaskStore.getState().lastSyncedAt
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })
    await untilSynced(before)

    expect(interfered).toBe(true)
    // 差分 → 断られた → 全部を取り直す
    const fetches = db.selects.filter((x) => x.table === 'lists').map((x) => (x.since ? 'delta' : 'full'))
    expect(fetches).toEqual(['delta', 'full'])
    // 両方の変更が残る（手元の題名・他の端末の優先度）
    const a = db.tables.tasks!.find((r) => r.id === 'a')!
    expect(a.title).toBe('a edited here')
    expect(a.priority).toBe('high')
    const s = useTaskStore.getState()
    expect(s.tasks.find((t) => t.id === 'a')).toMatchObject({ title: 'a edited here', priority: 'high' })
    expect(s.syncRejected).toEqual([])
  })

  describe('アカウントの境目のラベル表と購読（#286）', () => {
    const serverLabels = (userId: string) =>
      (db.tables.user_settings ?? [])
        .filter((r) => r.user_id === userId)
        .flatMap((r) => (r.log_labels as { name: string }[]).map((l) => l.name))

    it('ログアウト → 別の人でログインしても、前の人のラベル表は手元に残らず次の人のアカウントにも送られない', async () => {
      db.tables.lists!.push({ ...inboxRow }, { ...inboxRow, user_id: 'u2' })
      const hook = signIn('u1')
      await untilSynced()
      useTaskStore.setState({ timeLogTagPresets: ['A社 面接'], logCategoryColors: { 'A社 面接': '#ef4444' } })
      await act(async () => {
        expect(await flushPendingSync()).toBe(true)
      })
      expect(serverLabels('u1')).toEqual(['A社 面接'])

      env.user = null
      hook.rerender()
      clearLocalAccountState('u1')
      expect(useTaskStore.getState().timeLogTagPresets).not.toContain('A社 面接')
      expect(useTaskStore.getState().logLabelsUpdatedAt).toBeNull()
      expect(push.detach).toHaveBeenCalled()

      env.user = { id: 'u2' }
      hook.rerender()
      await untilSynced()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000)
      })
      expect(serverLabels('u2')).not.toContain('A社 面接')
      expect(useTaskStore.getState().timeLogTagPresets).not.toContain('A社 面接')
    })

    it('ログアウトせずにアカウントが替わったら、前の人のラベル表を空にし、購読を外して今の人で購読し直す', async () => {
      db.tables.lists!.push({ ...inboxRow }, { ...inboxRow, user_id: 'u2' })
      const hook = signIn('u1')
      await untilSynced()
      useTaskStore.setState({ timeLogTagPresets: ['A社 面接'], logCategoryColors: { 'A社 面接': '#ef4444' } })
      await act(async () => {
        await flushPendingSync()
        await vi.advanceTimersByTimeAsync(1_000)
      })
      const before = useTaskStore.getState().lastSyncedAt

      env.user = null
      hook.rerender()
      env.user = { id: 'u2' }
      hook.rerender()
      await untilSynced(before)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000)
      })

      expect(push.detach).toHaveBeenCalled()
      expect(push.resync).toHaveBeenCalled()
      expect(useTaskStore.getState().timeLogTagPresets).not.toContain('A社 面接')
      expect(serverLabels('u2')).not.toContain('A社 面接')
    })

    it('ラベル表を送れていなければ、ログアウトの前の「送れたか」は false', async () => {
      db.tables.lists!.push({ ...inboxRow })
      // ラベル表の行だけ取れない・送れない
      const failing: Record<string, unknown> = new Proxy(
        {},
        {
          get: (_t, key) =>
            key === 'then' ? (resolve: (v: unknown) => void) => resolve({ data: null, error: { message: 'boom' } }) : () => failing,
        },
      )
      const real = db.client as { from: (t: string) => unknown }
      env.client = { ...real, from: (t: string) => (t === 'user_settings' ? failing : real.from(t)) }
      signIn('u1')
      await untilSynced()
      useTaskStore.setState({ timeLogTagPresets: ['ゼミ'], logCategoryColors: { ゼミ: '#ef4444' } })
      let synced = true
      await act(async () => {
        synced = await flushPendingSync()
      })
      expect(synced).toBe(false)
    })
  })

  describe('前回同期の控えを保存できないとき（#255）', () => {
    it('保存に失敗したら前の控えを消す（古い控えのまま次の同期で合わせない）', () => {
      saveBaseline('u1', { lists: {}, tasks: {}, habits: {}, sections: {} } as never)
      expect(loadBaseline('u1')).not.toBeNull()
      const real = Storage.prototype.setItem
      Storage.prototype.setItem = function (key: string, value: string) {
        if (key.startsWith('chronograma-sync-baseline')) throw new DOMException('full', 'QuotaExceededError')
        return real.call(this, key, value)
      }
      try {
        expect(saveBaseline('u1', { lists: {}, tasks: {}, habits: {}, sections: {} } as never)).toBe(false)
      } finally {
        Storage.prototype.setItem = real
      }
      expect(loadBaseline('u1')).toBeNull()
    })

    it('本体を保存できていない間（容量不足）は、同期しても控えを書かずに消す', async () => {
      db.tables.lists!.push({ ...inboxRow })
      db.tables.tasks!.push(taskRow('r1', { title: 'from account' }))
      signIn('u1')
      await untilSynced()
      expect(loadBaseline('u1')).not.toBeNull()

      useTaskStore.setState({ storageFull: true })
      const before = useTaskStore.getState().lastSyncedAt
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000)
        await flushPendingSync()
      })
      expect(useTaskStore.getState().lastSyncedAt).not.toBe(before)
      expect(loadBaseline('u1')).toBeNull()
    })
  })

  it('アプリの版が同期の下限より古ければ送らず、読み込み直しを促す状態にする（#259）', async () => {
    db.tables.lists!.push({ ...inboxRow })
    db.tables.app_config = [{ user_id: '', key: 'min_sync_version', value: 99 }]
    useTaskStore.getState().addTask('local only')
    signIn('u1')
    for (let i = 0; i < 50 && useTaskStore.getState().syncState !== 'outdated'; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1)
      })
    }
    expect(useTaskStore.getState().syncState).toBe('outdated')
    expect(serverTitles('u1')).toEqual([])
  })
})
