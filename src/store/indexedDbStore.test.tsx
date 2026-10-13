import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore as firstStore } from './taskStore'
import { PERSIST_STORAGE_KEY } from './storeConstants'
import { startAfterDataLoaded } from '../lib/startAfterDataLoaded'

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
})
