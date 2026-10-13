import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LEGACY_PERSIST_STORAGE_KEY, PERSIST_STORAGE_KEY } from '../store/storeConstants'

/** 手元の写し・開いた DB はモジュールの中にあるので、タブごと（テストごと）に読み込み直す */
const opened: { closeDataStore: () => void }[] = []
async function openTab() {
  vi.resetModules()
  const m = await import('./dataStore')
  opened.push(m)
  return m
}

/** IndexedDB の中身をじかに読む（手元の写しを通さない） */
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

/** 書き込み（マイクロタスクでまとめて書く）とトランザクションが終わるのを待つ */
const settle = () => new Promise((r) => setTimeout(r, 20))

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
})
afterEach(() => {
  for (const m of opened.splice(0)) m.closeDataStore()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('localStorage からの移し替え', () => {
  it('本体と控えを IndexedDB に移し、書けたのを確かめてから localStorage から消す', async () => {
    localStorage.setItem(PERSIST_STORAGE_KEY, '{"state":{},"version":1}')
    localStorage.setItem('chronograma-sync-baseline-v1:u1', '{"tasks":{}}')
    localStorage.setItem('chronograma-view-v1', '{}')
    const m = await openTab()
    expect(await m.openDataStore()).toBe('indexeddb')
    expect(m.readStored(PERSIST_STORAGE_KEY)).toBe('{"state":{},"version":1}')
    expect(await readDisk(PERSIST_STORAGE_KEY)).toBe('{"state":{},"version":1}')
    expect(await readDisk('chronograma-sync-baseline-v1:u1')).toBe('{"tasks":{}}')
    expect(localStorage.getItem(PERSIST_STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem('chronograma-sync-baseline-v1:u1')).toBeNull()
    // 本体と控えのほかは動かさない
    expect(localStorage.getItem('chronograma-view-v1')).toBe('{}')
  })

  it('移すのは 1 回だけ。その後に localStorage で動いた回の分は、新しいものとして取り込んで記録する', async () => {
    localStorage.setItem(PERSIST_STORAGE_KEY, 'first')
    await (await openTab()).openDataStore()
    const reopened = await openTab()
    await reopened.openDataStore()
    expect(reopened.readStored(PERSIST_STORAGE_KEY)).toBe('first')
    expect(reopened.dataStoreRecoveredFromLocalStorage()).toBe(false)

    localStorage.setItem(PERSIST_STORAGE_KEY, 'written while on localStorage')
    const again = await openTab()
    expect(await again.openDataStore()).toBe('indexeddb')
    // 本体はそのままで、その回の本体はストアが合わせるまで別のキーに置く
    expect(again.readStored(PERSIST_STORAGE_KEY)).toBe('first')
    expect(again.readStored(again.RECOVERED_LOCAL_KEY)).toBe('written while on localStorage')
    expect(again.dataStoreRecoveredFromLocalStorage()).toBe(true)
    expect(localStorage.getItem(PERSIST_STORAGE_KEY)).toBeNull()
  })

  it('名前を変える前のキーしか無ければ、それを本体として移す', async () => {
    localStorage.setItem(LEGACY_PERSIST_STORAGE_KEY, 'legacy')
    const m = await openTab()
    await m.openDataStore()
    expect(m.readStored(PERSIST_STORAGE_KEY)).toBe('legacy')
    expect(localStorage.getItem(LEGACY_PERSIST_STORAGE_KEY)).toBeNull()
  })

  it('IndexedDB に書けなければ localStorage を消さずに、そのまま localStorage で動く', async () => {
    localStorage.setItem(PERSIST_STORAGE_KEY, 'keep')
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    const m = await openTab()
    expect(await m.openDataStore()).toBe('localStorage')
    expect(m.usingIndexedDb()).toBe(false)
    expect(m.dataStoreOpenError()).toBeTruthy()
    expect(localStorage.getItem(PERSIST_STORAGE_KEY)).toBe('keep')
    expect(m.readStored(PERSIST_STORAGE_KEY)).toBe('keep')
    m.writeStored(PERSIST_STORAGE_KEY, 'next')
    expect(localStorage.getItem(PERSIST_STORAGE_KEY)).toBe('next')

    // 次に開けたときに移す（印は付いていない）
    vi.restoreAllMocks()
    const later = await openTab()
    expect(await later.openDataStore()).toBe('indexeddb')
    expect(later.readStored(PERSIST_STORAGE_KEY)).toBe('next')
  })

  it('IndexedDB の無い端末（プライベートブラウズなど）は localStorage のまま', async () => {
    vi.stubGlobal('indexedDB', undefined)
    localStorage.setItem(PERSIST_STORAGE_KEY, 'local')
    const m = await openTab()
    expect(await m.openDataStore()).toBe('localStorage')
    expect(m.dataStoreOpenError()).toBeNull()
    expect(m.readStored(PERSIST_STORAGE_KEY)).toBe('local')
  })

  it('開けないまま時間が過ぎたら localStorage で始める', async () => {
    vi.spyOn(indexedDB, 'open').mockReturnValue({} as IDBOpenDBRequest)
    const m = await openTab()
    expect(await m.openDataStore({ timeoutMs: 10 })).toBe('localStorage')
  })
})

describe('書き込み', () => {
  it('同じタスクの間に書いたもの（本体と控え）は 1 つのトランザクションで書く', async () => {
    const m = await openTab()
    await m.openDataStore()
    const transaction = vi.spyOn(IDBDatabase.prototype, 'transaction')
    m.writeStored(PERSIST_STORAGE_KEY, 'main')
    m.writeStored('chronograma-sync-baseline-v1:u1', 'baseline')
    await settle()
    expect(transaction.mock.calls.filter(([, mode]) => mode === 'readwrite')).toHaveLength(1)
    expect(await readDisk(PERSIST_STORAGE_KEY)).toBe('main')
    expect(await readDisk('chronograma-sync-baseline-v1:u1')).toBe('baseline')
  })

  it('一方を書けなければ、どちらも書かない（前の中身のまま）', async () => {
    const m = await openTab()
    await m.openDataStore()
    m.writeStored(PERSIST_STORAGE_KEY, 'old')
    m.writeStored('chronograma-sync-baseline-v1:u1', 'old-baseline')
    await settle()
    const real = IDBObjectStore.prototype.put
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (key === PERSIST_STORAGE_KEY) throw new DOMException('full', 'QuotaExceededError')
      return real.call(this, value, key)
    })
    const errors: string[] = []
    m.writeStored('chronograma-sync-baseline-v1:u1', 'new-baseline', { onError: () => errors.push('baseline') })
    m.writeStored(PERSIST_STORAGE_KEY, 'new', { onError: () => errors.push('main') })
    await settle()
    expect(errors.sort()).toEqual(['baseline', 'main'])
    expect(await readDisk(PERSIST_STORAGE_KEY)).toBe('old')
    expect(await readDisk('chronograma-sync-baseline-v1:u1')).toBe('old-baseline')
  })
})

describe('書き終える前にページを離れたとき', () => {
  /** 書き込みのトランザクションが中断された（ページを離れた）ことにする */
  const abortWrites = () => {
    const real = IDBDatabase.prototype.transaction
    return vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (this: IDBDatabase, ...args) {
      if (args[1] === 'readwrite') throw new DOMException('the page was left', 'AbortError')
      return real.apply(this, args)
    })
  }

  it('書き終えていない分は localStorage に置き、次に開いたときに書く', async () => {
    const a = await openTab()
    await a.openDataStore()
    a.writeStored(PERSIST_STORAGE_KEY, 'saved')
    await settle()
    const aborted = abortWrites()
    a.writeStored(PERSIST_STORAGE_KEY, 'edited just before leaving')
    window.dispatchEvent(new Event('pagehide'))
    await settle()
    aborted.mockRestore()
    expect(await readDisk(PERSIST_STORAGE_KEY)).toBe('saved')

    const b = await openTab()
    await b.openDataStore()
    expect(b.readStored(PERSIST_STORAGE_KEY)).toBe('edited just before leaving')
    expect(await readDisk(PERSIST_STORAGE_KEY)).toBe('edited just before leaving')
    expect(localStorage.getItem('chronograma-data-unsaved')).toBeNull()
  })

  it('書き終えていた・ほかのタブが後から書いたなら、置いた分は使わない', async () => {
    const other = await openTab()
    await other.openDataStore()
    other.writeStored(PERSIST_STORAGE_KEY, 'later from another tab')
    await settle()
    // それより前に閉じたタブが置いた分
    localStorage.setItem('chronograma-data-unsaved', JSON.stringify({ [PERSIST_STORAGE_KEY]: { value: 'from A', at: 1 } }))
    const c = await openTab()
    await c.openDataStore()
    expect(c.readStored(PERSIST_STORAGE_KEY)).toBe('later from another tab')
  })
})

describe('他のタブの書き込み', () => {
  it('書けたら他のタブに知らせ、受けたタブは読み直す', async () => {
    const a = await openTab()
    await a.openDataStore()
    const b = await openTab()
    await b.openDataStore()
    const heard = vi.fn()
    b.onOtherTabChange(heard)
    a.writeStored(PERSIST_STORAGE_KEY, 'from A')
    await vi.waitFor(() => expect(heard).toHaveBeenCalledWith([PERSIST_STORAGE_KEY]))
    expect(b.readStored(PERSIST_STORAGE_KEY)).toBe('from A')
  })

  it('このタブがまだ書き終えていないキーは読み直さない（後から書く自分の値を他のタブが取り込む）', async () => {
    const a = await openTab()
    await a.openDataStore()
    a.writeStored(PERSIST_STORAGE_KEY, 'disk')
    await settle()
    const b = await openTab()
    await b.openDataStore()
    b.writeStored(PERSIST_STORAGE_KEY, 'mine')
    expect(await b.refreshStored()).toEqual([])
    expect(b.readStored(PERSIST_STORAGE_KEY)).toBe('mine')
    await settle()
    expect(await readDisk(PERSIST_STORAGE_KEY)).toBe('mine')
  })

  it('控えを消したのも他のタブに届く（ほかの人として同期したかの判定が古いままにならない）', async () => {
    const a = await openTab()
    await a.openDataStore()
    a.writeStored('chronograma-sync-baseline-v1:u2', 'x')
    await settle()
    const b = await openTab()
    await b.openDataStore()
    expect(b.storedKeys()).toContain('chronograma-sync-baseline-v1:u2')
    a.writeStored('chronograma-sync-baseline-v1:u2', null)
    await vi.waitFor(() => expect(b.storedKeys()).not.toContain('chronograma-sync-baseline-v1:u2'))
  })
})
