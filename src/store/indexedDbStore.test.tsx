import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore as firstStore } from './taskStore'
import { PERSIST_STORAGE_KEY } from './storeConstants'
import { startAfterDataLoaded } from '../lib/startAfterDataLoaded'

const reloadPage = vi.hoisted(() => vi.fn())
vi.mock('../lib/reloadPage', () => ({ reloadPage }))

/**
 * 本体と控えを IndexedDB に置いたときの、ストアの読み込み・保存・他のタブ（#255）。
 * 開いたタブ 1 つを、モジュールを読み込み直した 1 組（保存の置き場所＋ストア）で表す
 */
const tabs: { closeDataStore: () => void }[] = []
async function openTab() {
  vi.resetModules()
  const data = await import('../lib/dataStore')
  const mode = await data.openDataStore()
  // 本物の起動と同じく、保存データを読み終えてからストアを読み込む
  const { useTaskStore } = await import('./taskStore')
  const sync = await import('../lib/syncMerge')
  tabs.push(data)
  return { data, mode, useTaskStore, sync }
}
type Tab = Awaited<ReturnType<typeof openTab>>
const titles = (tab: Tab) => tab.useTaskStore.getState().tasks.map((t) => t.title)

function readDisk(key: string): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('chronograma-data')
    req.onsuccess = () => {
      const tx = req.result.transaction('kv', 'readonly')
      const get = tx.objectStore('kv').get(key)
      tx.oncomplete = () => {
        req.result.close()
        resolve(get.result as string | undefined)
      }
      tx.onabort = () => reject(tx.error)
    }
    req.onerror = () => reject(req.error)
  })
}
const diskTitles = async () =>
  (JSON.parse((await readDisk(PERSIST_STORAGE_KEY)) ?? '{"state":{"tasks":[]}}') as { state: { tasks: { title: string }[] } }).state.tasks
    .map((t) => t.title)
    .sort()
const settle = () => new Promise((r) => setTimeout(r, 20))

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
})
afterEach(() => {
  for (const t of tabs.splice(0)) t.closeDataStore()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('起動（保存データを読み終えてから始める）', () => {
  it('保存データを読み終えるまで、アプリ（ストア・同期・画面）を読み込まない', async () => {
    let finishOpen = () => {}
    const open = () => new Promise<void>((r) => (finishOpen = r))
    const start = vi.fn(() => Promise.resolve())
    const started = startAfterDataLoaded(open, start)
    await settle()
    expect(start).not.toHaveBeenCalled()
    finishOpen()
    await started
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('読めなくてもアプリは始める（localStorage のまま）', async () => {
    const start = vi.fn(() => Promise.resolve())
    await startAfterDataLoaded(() => Promise.reject(new Error('x')), start)
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('localStorage のデータを移し、ストアは読み込んだ時点でそのデータを持っている（空のストアで始まらない）', async () => {
    // 前の版（localStorage に保存していた版）で足したタスク
    firstStore.getState().addTask('before update')
    expect(localStorage.getItem(PERSIST_STORAGE_KEY)).not.toBeNull()

    const tab = await openTab()
    expect(tab.mode).toBe('indexeddb')
    expect(tab.useTaskStore.persist.hasHydrated()).toBe(true)
    expect(titles(tab)).toEqual(['before update'])
    expect(localStorage.getItem(PERSIST_STORAGE_KEY)).toBeNull()
    expect(await diskTitles()).toEqual(['before update'])
  })

  it('足したものは IndexedDB に残り、読み込み直しても出る', async () => {
    const tab = await openTab()
    tab.useTaskStore.getState().addTask('A')
    await settle()
    expect(await diskTitles()).toEqual(['A'])
    expect(localStorage.getItem(PERSIST_STORAGE_KEY)).toBeNull()
    tab.data.closeDataStore()

    const reloaded = await openTab()
    expect(titles(reloaded)).toEqual(['A'])
  })
})

describe('移した後に localStorage で動いた回', () => {
  it('その回の変更は、次に IndexedDB で開いたときに残る（前の本体の行も残り、取り込んだことを記録する）', async () => {
    const first = await openTab()
    first.useTaskStore.getState().addTask('in IndexedDB')
    // IndexedDB の側で変えた設定・日ごとの気分・よく入れる予定
    first.useTaskStore.getState().setTheme('dark')
    first.useTaskStore.getState().setDefaultBlockMinutes(30)
    first.useTaskStore.getState().setDayMood('2026-10-01', { mood: 4, note: 'good' })
    first.useTaskStore.getState().saveEventTemplates([{ id: 't1', title: 'Gym', startTime: '19:00', endTime: '20:00', color: null }])
    first.sync.saveBaseline('u1', { lists: {}, tasks: {}, habits: {}, sections: {} } as never)
    await settle()
    first.data.closeDataStore()

    // IndexedDB を開けなかった回（localStorage は移した後で空なので、空から始まる）
    const open = vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new DOMException('blocked', 'InvalidStateError')
    })
    const fallback = await openTab()
    expect(fallback.mode).toBe('localStorage')
    expect(titles(fallback)).toEqual([])
    fallback.useTaskStore.getState().addTask('while on localStorage')
    // その回で変えた設定（ほかは既定値のまま）
    fallback.useTaskStore.getState().setDailyCapacityMinutes(300)
    fallback.useTaskStore.getState().setDayMood('2026-10-02', { mood: 2 })
    expect(localStorage.getItem(PERSIST_STORAGE_KEY)).toContain('while on localStorage')
    open.mockRestore()

    const again = await openTab()
    expect(again.mode).toBe('indexeddb')
    expect(again.data.dataStoreRecoveredFromLocalStorage()).toBe(true)
    expect(titles(again).sort()).toEqual(['in IndexedDB', 'while on localStorage'])
    // 設定・気分・よく入れる予定は IndexedDB の側のまま、その回で変えたものだけが入る
    const s = again.useTaskStore.getState()
    expect(s.theme).toBe('dark')
    expect(s.defaultBlockMinutes).toBe(30)
    expect(s.dailyCapacityMinutes).toBe(300)
    expect(s.eventTemplates.map((t) => t.title)).toEqual(['Gym'])
    expect(Object.keys(s.dayMoods).sort()).toEqual(['2026-10-01', '2026-10-02'])
    expect(s.dayMoods['2026-10-01']!.note).toBe('good')
    await settle()
    expect(await diskTitles()).toEqual(['in IndexedDB', 'while on localStorage'])
    expect(JSON.parse((await readDisk(PERSIST_STORAGE_KEY))!).state.theme).toBe('dark')
    expect(localStorage.getItem(PERSIST_STORAGE_KEY)).toBeNull()
    // 合わせ終えたら取り込みの印は消え、本体と食い違う控えも消える（次の同期は両方を残す合わせ方）
    expect(await readDisk(again.data.RECOVERED_LOCAL_KEY)).toBeUndefined()
    expect(again.sync.loadBaseline('u1')).toBeNull()
    again.data.closeDataStore()

    // 取り込むのは 1 回だけ
    const later = await openTab()
    expect(later.data.dataStoreRecoveredFromLocalStorage()).toBe(false)
    expect(titles(later).sort()).toEqual(['in IndexedDB', 'while on localStorage'])
  })
})

describe('移した後に localStorage で動いた回（型の違う設定）', () => {
  it('その回の設定の型が違っても、読み込みと同じく既定値にして合わせる（画面が落ちない）', async () => {
    const first = await openTab()
    first.useTaskStore.getState().addTask('in IndexedDB')
    await settle()
    first.data.closeDataStore()

    const open = vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new DOMException('blocked', 'InvalidStateError')
    })
    const fallback = await openTab()
    expect(fallback.mode).toBe('localStorage')
    fallback.useTaskStore.getState().addTask('while on localStorage')
    // その回の保存（前の版の書き方などで、時間割・追加機能の型が違う）
    const saved = JSON.parse(localStorage.getItem(PERSIST_STORAGE_KEY)!) as { state: Record<string, unknown> }
    Object.assign(saved.state, {
      timetable: 'x',
      timetableUpdatedAt: '2099-01-01T00:00:00.000Z',
      addons: null,
      addonsUpdatedAt: '2099-01-01T00:00:00.000Z',
    })
    localStorage.setItem(PERSIST_STORAGE_KEY, JSON.stringify(saved))
    open.mockRestore()

    const again = await openTab()
    expect(again.data.dataStoreRecoveredFromLocalStorage()).toBe(true)
    const st = again.useTaskStore.getState()
    expect(titles(again).sort()).toEqual(['in IndexedDB', 'while on localStorage'])
    expect(Array.isArray(st.timetable.periods)).toBe(true)
    expect(st.addons.enabled).toEqual({})
    expect(Array.isArray(st.addons.dues)).toBe(true)
  })
})

describe('他のタブ（BroadcastChannel）', () => {
  it('2 つのタブで別々に足したタスクが、どちらのタブにも保存にも両方残る', async () => {
    const a = await openTab()
    const b = await openTab()
    a.useTaskStore.getState().addTask('From tab A')
    await vi.waitFor(() => expect(titles(b)).toEqual(['From tab A']))
    b.useTaskStore.getState().addTask('From tab B')
    await vi.waitFor(() => expect(titles(a).sort()).toEqual(['From tab A', 'From tab B']))
    // 古いままのタブがもう一方の分を上書きしない
    a.useTaskStore.getState().addTask('From tab A again')
    await vi.waitFor(() => expect(titles(b)).toHaveLength(3))
    await settle()
    expect(await diskTitles()).toEqual(['From tab A', 'From tab A again', 'From tab B'])
  })

  it('裏から戻ったときも読み直す（知らせを受け取れなかったとき）', async () => {
    const a = await openTab()
    const b = await openTab()
    // 知らせが届かなかった
    const post = vi.spyOn(BroadcastChannel.prototype, 'postMessage').mockImplementation(() => {})
    a.useTaskStore.getState().addTask('missed')
    await settle()
    expect(titles(b)).toEqual([])
    post.mockRestore()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(titles(b)).toEqual(['missed']))
  })
})

describe('前回同期の控え', () => {
  it('ほかの人として同期したかは、控えと同じ IndexedDB から読む', async () => {
    const tab = await openTab()
    tab.sync.saveBaseline('u2', { lists: {}, tasks: {}, habits: {}, sections: {} } as never)
    await settle()
    expect(Object.keys(localStorage).filter((k) => k.startsWith('chronograma-sync-baseline'))).toEqual([])
    expect(tab.sync.hasOtherUsersBaseline('u1')).toBe(true)
    expect(tab.sync.hasOtherUsersBaseline('u2')).toBe(false)
    expect(await readDisk('chronograma-sync-baseline-v1:u2')).toBeTruthy()
  })

  it('本体を書けなければ、同じトランザクションの控えも書かれず消え、容量不足を知らせる', async () => {
    const tab = await openTab()
    tab.sync.saveBaseline('u1', { lists: {}, tasks: { old: {} }, habits: {}, sections: {} } as never)
    tab.useTaskStore.getState().addTask('saved')
    await settle()

    const real = IDBObjectStore.prototype.put
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (key === PERSIST_STORAGE_KEY) throw new DOMException('full', 'QuotaExceededError')
      return real.call(this, value, key)
    })
    const reported = vi.fn()
    // 同期の終わり（`done`）と同じ: 控えを書いて、本体（dataOwner）を書く
    tab.sync.saveBaseline('u1', { lists: {}, tasks: { new: {} }, habits: {}, sections: {} } as never, reported)
    tab.useTaskStore.getState().setDataOwner('u1')
    await vi.waitFor(() => expect(tab.useTaskStore.getState().storageFull).toBe(true))
    expect(reported).toHaveBeenCalledTimes(1)
    // 控えは消えた（次の同期は両方を残す合わせ方）。本体は前の中身のまま
    expect(tab.sync.loadBaseline('u1')).toBeNull()
    await settle()
    expect(await readDisk('chronograma-sync-baseline-v1:u1')).toBeUndefined()
    expect(JSON.parse((await readDisk(PERSIST_STORAGE_KEY))!).state.dataOwner).toBeNull()

    // また書けるようになったら知らせを消す
    vi.restoreAllMocks()
    tab.useTaskStore.getState().addTask('after')
    await vi.waitFor(() => expect(tab.useTaskStore.getState().storageFull).toBe(false))
    expect(await diskTitles()).toEqual(['after', 'saved'])
  })
})

describe('本体とどこまで合わせたかの記録（控え・設定の版）', () => {
  /** 本体を書くトランザクションを、書いている途中で中断させる（容量不足と同じく、失敗は後から分かる） */
  function abortBodyWrites() {
    const real = IDBObjectStore.prototype.put
    return vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      const req = real.call(this, value, key)
      if (key === PERSIST_STORAGE_KEY) {
        const tx = this.transaction
        req.addEventListener('success', () => tx.abort())
      }
      return req
    })
  }

  it('本体を書いている途中で控え・設定の版を書いても、本体が書けなければどれも新しくならない。開き直しても古い設定を送らない', async () => {
    const tab = await openTab()
    const settings = await import('../lib/settingSync')
    const { settingSyncStep } = settings
    const { asIncomingChange } = await import('../lib/changeOrigin')
    // 前回の同期: 時間割は V1 に合わせた
    asIncomingChange(() => tab.useTaskStore.setState({ timetableUpdatedAt: 'V1' }))
    settings.saveSettingSyncedAt('u1', 'timetable', 'V1')
    tab.sync.saveBaseline('u1', { lists: {}, tasks: { old: {} }, habits: {}, sections: {} } as never)
    await settle()

    const put = abortBodyWrites()
    // 同期でサーバーの時間割（V2）を取り込む: 本体を書くトランザクションはもう始まっている
    asIncomingChange(() =>
      tab.useTaskStore.setState({
        timetable: { ...tab.useTaskStore.getState().timetable, termStart: '2026-10-01' },
        timetableUpdatedAt: 'V2',
      }),
    )
    await Promise.resolve()
    await Promise.resolve()
    // 送るものが無く、すぐに控えと設定の版を書く（別のタスク）
    tab.sync.saveBaseline('u1', { lists: {}, tasks: { new: {} }, habits: {}, sections: {} } as never)
    settings.saveSettingSyncedAt('u1', 'timetable', 'V2')
    await vi.waitFor(() => expect(tab.useTaskStore.getState().storageFull).toBe(true))
    await settle()
    put.mockRestore()

    expect(JSON.parse((await readDisk(PERSIST_STORAGE_KEY))!).state.timetableUpdatedAt).toBe('V1')
    // 控えは新しくならない（書けなかったので消すのは、前の版と同じ。次の同期は両方を残す合わせ方）
    expect((await readDisk('chronograma-sync-baseline-v1:u1')) ?? '').not.toContain('new')
    expect(JSON.parse((await readDisk('chronograma-settings-sync-v1:u1'))!).timetable).toBe('V1')
    tab.data.closeDataStore()

    // 開き直すと、手元は V1 の値・V1 の版。サーバーが V2 なら合わせる（古い値を「手元で変えた」と読んで送らない）
    const again = await openTab()
    const reopened = await import('../lib/settingSync')
    const st = again.useTaskStore.getState()
    const syncedAt = reopened.loadSettingSyncedAt('u1', 'timetable')
    expect(syncedAt).toBe('V1')
    expect(settingSyncStep({ updatedAt: st.timetableUpdatedAt, syncedAt }, { updatedAt: 'V2' }, false).kind).toBe('apply')
  })

  it('設定の版と版の中身の控えは localStorage から本体と同じ IndexedDB に移す。移した後に localStorage にあれば（localStorage で動いた回）捨てる', async () => {
    localStorage.setItem('chronograma-settings-sync-v1:u1', JSON.stringify({ labels: 'V1', timetable: 'T1' }))
    // 前の版は中身の控え（中身ごとに合わせる設定）も localStorage に置いていた
    const term = { termStart: '2026-04-01' }
    localStorage.setItem('chronograma-settings-base-v1:u1', JSON.stringify({ timetable: { at: 'T1', value: term } }))
    const first = await openTab()
    expect(localStorage.getItem('chronograma-settings-sync-v1:u1')).toBeNull()
    expect(localStorage.getItem('chronograma-settings-base-v1:u1')).toBeNull()
    expect(JSON.parse((await readDisk('chronograma-settings-sync-v1:u1'))!).labels).toBe('V1')
    const s1 = await import('../lib/settingSync')
    expect(s1.loadSettingSyncedAt('u1', 'labels')).toBe('V1')
    expect(s1.loadSettingBase('u1', 'timetable', 'T1')).toEqual(term)
    first.data.closeDataStore()

    // localStorage で動いた回が書いた版（どの本体の版か分からない）
    localStorage.setItem('chronograma-settings-sync-v1:u1', JSON.stringify({ labels: 'V9' }))
    await openTab()
    const s2 = await import('../lib/settingSync')
    expect(s2.loadSettingSyncedAt('u1', 'labels')).toBeNull()
    expect(localStorage.getItem('chronograma-settings-sync-v1:u1')).toBeNull()
    expect(await readDisk('chronograma-settings-sync-v1:u1')).toBeUndefined()
  })
})

describe('保存先との接続・開けない回（#255 の残り）', () => {
  it('接続が切れたら 1 回開き直して書き直す（容量不足を出さない）', async () => {
    const tab = await openTab()
    const real = IDBDatabase.prototype.transaction
    let fail = true
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (
      this: IDBDatabase,
      ...args: Parameters<IDBDatabase['transaction']>
    ) {
      if (fail && args[1] === 'readwrite') {
        fail = false
        throw new DOMException('Connection to Indexed Database server lost. Refresh the page to try again', 'UnknownError')
      }
      return real.apply(this, args)
    })
    tab.useTaskStore.getState().addTask('after reconnect')
    await vi.waitFor(async () => expect(await diskTitles()).toEqual(['after reconnect']))
    expect(tab.data.dataStoreLost()).toBe(false)
    expect(tab.useTaskStore.getState().storageFull).toBe(false)
  })

  it('開き直せなければ容量不足とは別に知らせ、書けなかった分は次に開いたときに書く', async () => {
    const tab = await openTab()
    tab.useTaskStore.getState().addTask('saved')
    await settle()
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(() => {
      throw new DOMException('Connection to Indexed Database server lost', 'UnknownError')
    })
    const open = vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new DOMException('lost', 'UnknownError')
    })
    tab.useTaskStore.getState().addTask('while lost')
    await vi.waitFor(() => expect(tab.data.dataStoreLost()).toBe(true))
    expect(tab.useTaskStore.getState().storageFull).toBe(false)
    expect(localStorage.getItem('chronograma-data-unsaved')).toContain('while lost')
    // 続けた編集も残す
    tab.useTaskStore.getState().addTask('still lost')
    await settle()
    expect(localStorage.getItem('chronograma-data-unsaved')).toContain('still lost')
    vi.mocked(IDBDatabase.prototype.transaction).mockRestore()
    open.mockRestore()
    tab.data.closeDataStore()

    const again = await openTab()
    expect(titles(again).sort()).toEqual(['saved', 'still lost', 'while lost'])
  })

  it('前に IndexedDB で開けた端末で開けなかったら、空のまま始めない印を立てる', async () => {
    const first = await openTab()
    expect(first.data.dataStoreUnavailable()).toBe(false)
    first.data.closeDataStore()
    const open = vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new DOMException('blocked', 'InvalidStateError')
    })
    const fallback = await openTab()
    expect(fallback.mode).toBe('localStorage')
    expect(fallback.data.dataStoreUnavailable()).toBe(true)
    open.mockRestore()
  })

  it('書き終えるまで待ってから読み込み直す', async () => {
    const tab = await openTab()
    reloadPage.mockClear()
    tab.useTaskStore.getState().addTask('before reload')
    tab.data.reloadWhenSaved()
    expect(reloadPage).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(reloadPage).toHaveBeenCalledTimes(1))
    expect(await diskTitles()).toEqual(['before reload'])
  })

  it('容量不足で書けなければ、自動バックアップの古いものを手放して書き直す', async () => {
    const tab = await openTab()
    const backup = await import('../lib/autoBackup')
    await backup.saveAutoBackup('beforeSync', '2026-10-13', [{ id: 't' } as never], '{"old":1}', null)
    await new Promise((r) => setTimeout(r, 2))
    await backup.saveAutoBackup('beforeSync', '2026-10-13', [{ id: 't' } as never], '{"new":1}', null)
    const real = IDBObjectStore.prototype.put
    let full = true
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (full && key === PERSIST_STORAGE_KEY) {
        full = false
        throw new DOMException('full', 'QuotaExceededError')
      }
      return real.call(this, value, key)
    })
    tab.useTaskStore.getState().addTask('fits after release')
    await vi.waitFor(async () => expect(await diskTitles()).toEqual(['fits after release']))
    expect(await backup.listAutoBackups(null)).toHaveLength(1)
    expect(tab.useTaskStore.getState().storageFull).toBe(false)
  })
})

describe('移した後に localStorage で動いた回（消した行）', () => {
  it('その回で完全に消した行は、次に IndexedDB で開いたときに戻らない（前に送っていない行は残す）', async () => {
    const first = await openTab()
    const s = first.useTaskStore.getState()
    s.addTask('kept')
    s.addTask('purged')
    s.addTask('not yet sent')
    const byTitle = (title: string) => first.useTaskStore.getState().tasks.find((t) => t.title === title)!
    const kept = byTitle('kept')
    const purged = byTitle('purged')
    // 前回の同期: kept と purged は送った（not yet sent はまだ）
    first.useTaskStore.getState().setDataOwner('u1')
    first.sync.saveBaseline('u1', { lists: {}, tasks: { [kept.id]: {}, [purged.id]: {} }, habits: {}, sections: {} } as never)
    await settle()
    first.data.closeDataStore()

    const open = vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new DOMException('blocked', 'InvalidStateError')
    })
    const fallback = await openTab()
    expect(fallback.mode).toBe('localStorage')
    // その回: 同期でサーバーの行（kept・purged）を取り込み、purged をゴミ箱から完全に消して送った
    fallback.useTaskStore.setState({ tasks: [kept], dataOwner: 'u1' })
    fallback.sync.saveBaseline('u1', { lists: {}, tasks: { [kept.id]: {} }, habits: {}, sections: {} } as never)
    open.mockRestore()

    const again = await openTab()
    expect(again.data.dataStoreRecoveredFromLocalStorage()).toBe(true)
    expect(titles(again).sort()).toEqual(['kept', 'not yet sent'])
    await settle()
    expect(await diskTitles()).toEqual(['kept', 'not yet sent'])
    expect(await readDisk(`${again.data.RECOVERED_BASELINE_PREFIX}chronograma-sync-baseline-v1:u1`)).toBeUndefined()
  })
})

describe('読めない保存データ', () => {
  it('壊れた行を外したら、元の中身を IndexedDB の別のキーに残す', async () => {
    const first = await openTab()
    first.useTaskStore.getState().addTask('ok')
    await settle()
    const saved = JSON.parse((await readDisk(PERSIST_STORAGE_KEY))!) as { state: { tasks: unknown[] } }
    saved.state.tasks.push({ id: 'broken', title: 42 })
    first.data.writeStored(PERSIST_STORAGE_KEY, JSON.stringify(saved))
    await settle()
    first.data.closeDataStore()

    const tab = await openTab()
    expect(titles(tab)).toEqual(['ok'])
    const copies = tab.data.storedKeys().filter((k) => k.startsWith(`${PERSIST_STORAGE_KEY}-unreadable-`))
    expect(copies).toHaveLength(1)
    expect(tab.data.readStored(copies[0]!)).toContain('broken')
  })

  it('読めないことが続いても写しは 1 つまで。localStorage で動いた回の写しも起動時に片付ける（#256）', async () => {
    // IndexedDB を開けなかった回に localStorage に写した分（IndexedDB には移さない）
    localStorage.setItem(`${PERSIST_STORAGE_KEY}-unreadable-1`, 'old copy')
    for (let i = 0; i < 2; i++) {
      const tab = await openTab()
      if (i === 0) tab.useTaskStore.getState().addTask('ok')
      await settle()
      const saved = JSON.parse((await readDisk(PERSIST_STORAGE_KEY))!) as { state: { tasks: unknown[] } }
      saved.state.tasks.push({ id: `broken-${i}`, title: 42 })
      tab.data.writeStored(PERSIST_STORAGE_KEY, JSON.stringify(saved))
      await settle()
      tab.data.closeDataStore()
      await new Promise((r) => setTimeout(r, 2))
    }
    const tab = await openTab()
    await settle()
    const copies = tab.data.storedKeys().filter((k) => k.startsWith(`${PERSIST_STORAGE_KEY}-unreadable-`))
    expect(copies).toHaveLength(1)
    expect(tab.data.readStored(copies[0]!)).toContain('broken-1')
    expect(Object.keys(localStorage).filter((k) => k.startsWith(`${PERSIST_STORAGE_KEY}-unreadable-`))).toEqual([])
  })
})

describe('ログアウトの片付け（#256）', () => {
  it('写しは消え、前回同期の控えは中身を消して印だけ IndexedDB に残す', async () => {
    const tab = await openTab()
    const cleanup = await import('../lib/deviceCleanup')
    tab.sync.saveBaseline('u1', { lists: {}, tasks: { t1: 1 }, habits: {}, sections: {} } as never)
    cleanup.keepStorageCopy(cleanup.UNREADABLE_COPY_PREFIX, '{"title":"前の人"}')
    await settle()
    cleanup.clearSignedOutLeftovers()
    await settle()
    expect(await readDisk('chronograma-sync-baseline-v1:u1')).toBe('null')
    expect(tab.sync.loadBaseline('u1')).toBeNull()
    expect(tab.sync.hasOtherUsersBaseline('u2')).toBe(true)
    expect(tab.data.storedKeys().filter((k) => k.includes('-unreadable-'))).toEqual([])
  })
})
