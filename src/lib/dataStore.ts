/**
 * 本体（ストアの保存データ `chronograma-storage`）と前回同期の控え（`chronograma-sync-baseline-v1:{userId}`）の置き場所。
 *
 * - IndexedDB（`chronograma-data`）に置く。IndexedDB か BroadcastChannel が使えない端末（プライベートブラウズなど）は localStorage のまま
 * - 起動時に 1 回（`openDataStore`。ストアと画面を読み込む前）全部を読んで手元に持ち、以降の読みは手元から返す。
 *   ストアの読み込み（persist の hydration）は同期のままで、空のストアのまま画面や同期が動き出すことがない
 * - 書き込みは手元に入れてから、同じタスクの間に書いたもの（本体・控え・本体の中の `dataOwner`）を 1 つのトランザクションで書く。
 *   失敗するとどれも書かれない（本体だけ古い・控えだけ新しい、にならない）
 * - 書けたら他のタブに BroadcastChannel で知らせ、受けたタブは IndexedDB から読み直す（localStorage の storage イベントの代わり）
 * - localStorage にあった本体と控えは、初めて開いたときに 1 回だけ移す。IndexedDB に書けたのを読み直して確かめてから localStorage から消す
 * - 移した後に localStorage で動いた回（開けなかった）があれば、次に開けたときにその分を取り込む（`RECOVERED_LOCAL_KEY`）
 */
import { LEGACY_PERSIST_STORAGE_KEY, PERSIST_STORAGE_KEY } from '../store/storeConstants'

export const BASELINE_KEY_PREFIX = 'chronograma-sync-baseline-v1:'
const DB_NAME = 'chronograma-data'
const STORE = 'kv'
const META = 'meta'
/** localStorage から移したことの印（`meta` に置く。移すのは 1 回だけ） */
const MIGRATED = 'migratedFromLocalStorage'
const CHANNEL = 'chronograma-data'
/** 開くのにこれより長くかかったら localStorage のまま始める（画面がいつまでも出ない、にしない） */
const OPEN_TIMEOUT_MS = 8000

let db: IDBDatabase | null = null
let channel: BroadcastChannel | null = null
let openError: unknown = null
/** IndexedDB の中身の写し（読みはここから） */
const cache = new Map<string, string>()

interface WriteCallbacks {
  /** 書けた（トランザクションが終わった） */
  onSaved?: () => void
  /** 書けなかった（同じトランザクションの書き込みはどれも書かれていない） */
  onError?: (err: unknown) => void
}
interface PendingWrite extends WriteCallbacks {
  value: string | null
  /** 書いた時刻（`meta` に `at:{キー}` で残す。閉じる前に書き終えなかった分と、どちらが新しいかを比べる） */
  at: number
}
let queue = new Map<string, PendingWrite>()
let flushScheduled = false
/** まだ書き終えていない（次のトランザクションを待っている・書いている途中の）キーと、その数 */
const busy = new Map<string, number>()
const otherTabListeners = new Set<(keys: string[]) => void>()

/** IndexedDB に置いているか（false なら localStorage） */
export function usingIndexedDb(): boolean {
  return db !== null
}

/** 開けなかったときの理由（開けた・IndexedDB の無い端末なら null） */
export function dataStoreOpenError(): unknown {
  return openError
}

/** 読む。localStorage では読めないと例外になる（呼ぶ側で受ける） */
export function readStored(key: string): string | null {
  if (!db) return localStorage.getItem(key)
  return cache.get(key) ?? null
}

/** 置いているキーの一覧 */
export function storedKeys(): string[] {
  if (db) return [...cache.keys()]
  const out: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key !== null) out.push(key)
  }
  return out
}

/**
 * 書く（`null` は消す）。localStorage ではその場で書き、失敗は例外になる（`callbacks` は呼ばない）。
 * IndexedDB では手元に入れてすぐ返り、同じタスクの間の書き込みとまとめて書く。結果は `callbacks` に届く
 */
export function writeStored(key: string, value: string | null, callbacks?: WriteCallbacks): void {
  if (!db) {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
    return
  }
  if (value === null) cache.delete(key)
  else cache.set(key, value)
  if (!queue.has(key)) busy.set(key, (busy.get(key) ?? 0) + 1)
  queue.set(key, { value, at: Date.now(), ...callbacks })
  if (!flushScheduled) {
    flushScheduled = true
    queueMicrotask(flush)
  }
}

function flush() {
  flushScheduled = false
  const batch = queue
  queue = new Map()
  if (batch.size === 0) return
  for (const [key, w] of batch) lastWrite.set(key, { value: w.value, at: w.at })
  const finish = (err: unknown) => {
    for (const key of batch.keys()) {
      const n = (busy.get(key) ?? 1) - 1
      if (n > 0) busy.set(key, n)
      else busy.delete(key)
    }
    if (err === null) {
      try {
        channel?.postMessage({ keys: [...batch.keys()] })
      } catch {
        /* 知らせられなくても、他のタブは見えるようになったときに読み直す */
      }
      for (const w of batch.values()) w.onSaved?.()
    } else for (const w of batch.values()) w.onError?.(err)
  }
  let tx: IDBTransaction | null = null
  try {
    if (!db) throw new DOMException('the data store is closed', 'InvalidStateError')
    tx = db.transaction([STORE, META], 'readwrite')
    const store = tx.objectStore(STORE)
    const meta = tx.objectStore(META)
    for (const [key, w] of batch) {
      if (w.value === null) store.delete(key)
      else store.put(w.value, key)
      meta.put(w.at, `at:${key}`)
    }
  } catch (err) {
    try {
      tx?.abort()
    } catch {
      /* もう終わっている */
    }
    finish(err)
    return
  }
  const t = tx
  t.oncomplete = () => finish(null)
  t.onabort = () => finish(t.error ?? new DOMException('the write was aborted', 'AbortError'))
}

/** 他のタブが書いたキー（読み直した後）を受け取る。localStorage の間は storage イベント */
export function onOtherTabChange(listener: (keys: string[]) => void): () => void {
  otherTabListeners.add(listener)
  return () => otherTabListeners.delete(listener)
}

function emitOtherTab(keys: string[]) {
  if (keys.length === 0) return
  for (const l of otherTabListeners) l(keys)
}

/**
 * 書き終えていない分を閉じる前に localStorage に置くキー。IndexedDB のトランザクションはページを離れると中断されることがあり、
 * 編集の直後に閉じる・別のページへ移ると、その編集が消えていた。次に開いたときに、IndexedDB より新しければ書く（`loadAll`）
 */
const UNSAVED_KEY = 'chronograma-data-unsaved'
/** 書き終えていないキーの、最後に書いた値と時刻 */
const lastWrite = new Map<string, { value: string | null; at: number }>()

function keepUnsavedForNextOpen() {
  if (!db || busy.size === 0) return
  const unsaved: Record<string, { value: string | null; at: number }> = {}
  for (const key of busy.keys()) {
    const w = queue.get(key) ?? lastWrite.get(key)
    if (w) unsaved[key] = { value: w.value, at: w.at }
  }
  try {
    localStorage.setItem(UNSAVED_KEY, JSON.stringify(unsaved))
  } catch {
    /* 置けなければ、書き終えるのを待つだけ */
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (!db && e.key !== null) emitOtherTab([e.key])
  })
  window.addEventListener('pagehide', keepUnsavedForNextOpen)
}

/**
 * IndexedDB から読み直して手元を合わせ、変わったキーを返す（`keys` が無ければ全部）。
 * まだ書き終えていないキーは読み直さない（このタブの書き込みが後から書かれ、それを他のタブが取り込む）
 */
export async function refreshStored(keys?: readonly string[]): Promise<string[]> {
  const d = db
  if (!d) return []
  let read: Map<string, string | undefined>
  try {
    read = await new Promise((resolve, reject) => {
      const out = new Map<string, string | undefined>()
      const tx = d.transaction(STORE, 'readonly')
      const store = tx.objectStore(STORE)
      if (keys) {
        for (const key of keys) {
          const req = store.get(key)
          req.onsuccess = () => out.set(key, req.result as string | undefined)
        }
      } else {
        const req = store.openCursor()
        req.onsuccess = () => {
          const cursor = req.result
          if (!cursor) return
          out.set(String(cursor.key), cursor.value as string)
          cursor.continue()
        }
      }
      tx.oncomplete = () => resolve(out)
      tx.onabort = () => reject(tx.error)
    })
  } catch {
    return []
  }
  // 全部を読んだときは、無くなったキーも手元から外す
  if (!keys) for (const key of cache.keys()) if (!read.has(key)) read.set(key, undefined)
  const changed: string[] = []
  for (const [key, value] of read) {
    if (busy.has(key)) continue
    if (cache.get(key) === value) continue
    if (value === undefined) cache.delete(key)
    else cache.set(key, value)
    changed.push(key)
  }
  return changed
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE)
      req.result.createObjectStore(META)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new DOMException('the data store is blocked', 'InvalidStateError'))
  })
}

/** localStorage にある、移すもの（[IndexedDB のキー, 中身, localStorage のキー]） */
function localStorageEntries(): [string, string, string][] {
  const out: [string, string, string][] = []
  try {
    const main = localStorage.getItem(PERSIST_STORAGE_KEY)
    // 名前を変える前のキーしか無ければ、それを本体にする
    const legacy = main === null ? localStorage.getItem(LEGACY_PERSIST_STORAGE_KEY) : null
    if (main !== null) out.push([PERSIST_STORAGE_KEY, main, PERSIST_STORAGE_KEY])
    else if (legacy !== null) out.push([PERSIST_STORAGE_KEY, legacy, LEGACY_PERSIST_STORAGE_KEY])
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith(BASELINE_KEY_PREFIX)) continue
      const value = localStorage.getItem(key)
      if (value !== null) out.push([key, value, key])
    }
  } catch {
    /* 読めなければ移すものは無い */
  }
  return out
}

/**
 * 移した後に localStorage で動いた回（IndexedDB を開けなかった）の本体を置くキー。IndexedDB の本体はそのまま残し、
 * ストアを作った後に、ストアの既定値と比べてその回で変えた分だけを合わせる（`store/recoverLocal.ts`）
 */
export const RECOVERED_LOCAL_KEY = `${PERSIST_STORAGE_KEY}-recovered-local`

/** 移した後に localStorage で動いた回のデータを取り込んだ（`openDataStore` の後に 1 回だけ記録する） */
let recoveredFromLocalStorage = false
export function dataStoreRecoveredFromLocalStorage(): boolean {
  return recoveredFromLocalStorage
}

/**
 * 全部を読む。まだ移していなければ、同じトランザクションで localStorage の分を写して印を付ける。
 * 移した印があるのに localStorage に本体・控えがある＝その間に localStorage で動いた回があった。その分を取り込む
 * （本体は `RECOVERED_LOCAL_KEY` に置いてストアが合わせる。控えはその回のものにし、その回に無い人の控えは本体と食い違うので消す）
 */
function loadAll(d: IDBDatabase): Promise<{ entries: Map<string, string>; copied: [string, string, string][]; recovered: boolean }> {
  return new Promise((resolve, reject) => {
    const entries = new Map<string, string>()
    let copied: [string, string, string][] = []
    let recovered = false
    const tx = d.transaction([STORE, META], 'readwrite')
    const kv = tx.objectStore(STORE)
    const meta = tx.objectStore(META)
    const readAll = () => {
      const keep = new Set(copied.map(([key]) => key))
      const cursor = kv.openCursor()
      cursor.onsuccess = () => {
        const c = cursor.result
        if (!c) return
        const key = String(c.key)
        if (recovered && key.startsWith(BASELINE_KEY_PREFIX) && !keep.has(key)) c.delete()
        else entries.set(key, c.value as string)
        c.continue()
      }
    }
    // 前に閉じたとき書き終えていなかった分。IndexedDB のほうが新しい（書き終えていた・ほかのタブが後から書いた）キーは捨てる
    let unsaved: Record<string, { value: string | null; at: number }> = {}
    try {
      unsaved = JSON.parse(localStorage.getItem(UNSAVED_KEY) ?? '{}') as typeof unsaved
    } catch {
      /* 読めなければ無いものとして */
    }
    for (const [key, w] of Object.entries(unsaved)) {
      if (typeof w?.at !== 'number' || (typeof w.value !== 'string' && w.value !== null)) continue
      const at = meta.get(`at:${key}`)
      at.onsuccess = () => {
        if (typeof at.result === 'number' && at.result >= w.at) return
        if (w.value === null) kv.delete(key)
        else kv.put(w.value, key)
        meta.put(w.at, `at:${key}`)
      }
    }
    const marker = meta.get(MIGRATED)
    marker.onsuccess = () => {
      const local = localStorageEntries()
      if (marker.result === undefined) {
        copied = local
        for (const [key, value] of copied) kv.put(value, key)
        meta.put(new Date().toISOString(), MIGRATED)
        readAll()
        return
      }
      if (local.length === 0) {
        readAll()
        return
      }
      recovered = true
      copied = local.map(([key, value, from]) => [key === PERSIST_STORAGE_KEY ? RECOVERED_LOCAL_KEY : key, value, from])
      for (const [key, value] of copied) kv.put(value, key)
      readAll()
    }
    tx.oncomplete = () => {
      try {
        localStorage.removeItem(UNSAVED_KEY)
      } catch {
        /* ignore */
      }
      resolve({ entries, copied, recovered })
    }
    tx.onabort = () => reject(tx.error)
  })
}

/** 写したものが IndexedDB にそのまま入っているか（読み直して比べる） */
function verifyCopied(d: IDBDatabase, copied: readonly [string, string, string][]): Promise<boolean> {
  return new Promise((resolve) => {
    let ok = true
    const tx = d.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)
    for (const [key, value] of copied) {
      const req = store.get(key)
      req.onsuccess = () => {
        if (req.result !== value) ok = false
      }
    }
    tx.oncomplete = () => resolve(ok)
    tx.onabort = () => resolve(false)
  })
}

/** 確かめられなかったら印を外す（次に開いたときにもう一度移す。localStorage はそのまま） */
function forgetMigration(d: IDBDatabase): Promise<void> {
  return new Promise((resolve) => {
    try {
      const tx = d.transaction(META, 'readwrite')
      tx.objectStore(META).delete(MIGRATED)
      tx.oncomplete = () => resolve()
      tx.onabort = () => resolve()
    } catch {
      resolve()
    }
  })
}

function withTimeout<T>(p: Promise<T>, ms: number, onLate: (value: T) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    let done = false
    const timer = setTimeout(() => {
      done = true
      reject(new DOMException('opening the data store timed out', 'TimeoutError'))
    }, ms)
    p.then(
      (v) => {
        clearTimeout(timer)
        if (done) onLate(v)
        else resolve(v)
      },
      (err: unknown) => {
        clearTimeout(timer)
        if (!done) reject(err instanceof Error ? err : new Error(String(err)))
      },
    )
  })
}

/**
 * 起動時に 1 回、ストアと画面を読み込む前に呼ぶ。IndexedDB を開いて全部を読み、まだなら localStorage から移す。
 * 開けない・移せないときは localStorage のまま（`'localStorage'`）。理由は `dataStoreOpenError`
 */
export async function openDataStore(opts: { timeoutMs?: number } = {}): Promise<'indexeddb' | 'localStorage'> {
  if (db) return 'indexeddb'
  if (typeof indexedDB === 'undefined' || typeof BroadcastChannel === 'undefined') return 'localStorage'
  let d: IDBDatabase | null = null
  try {
    d = await withTimeout(openDb(), opts.timeoutMs ?? OPEN_TIMEOUT_MS, (late) => late.close())
    const { entries, copied, recovered } = await loadAll(d)
    if (copied.length > 0) {
      if (!(await verifyCopied(d, copied))) {
        // 初めての移し替えなら印を外して次にやり直す。取り込みなら印は残す（localStorage が残るので次に開いたときにもう一度取り込む）
        if (!recovered) await forgetMigration(d)
        throw new Error('the copy from localStorage could not be verified')
      }
      // 書けたのを確かめたので、localStorage の分を消す（消せなくても、もう読まない）
      for (const [, , from] of copied) {
        try {
          localStorage.removeItem(from)
        } catch {
          /* ignore */
        }
      }
    }
    recoveredFromLocalStorage = recovered
    cache.clear()
    for (const [key, value] of entries) cache.set(key, value)
    db = d
    channel = new BroadcastChannel(CHANNEL)
    channel.onmessage = (e: MessageEvent<{ keys?: unknown }>) => {
      const keys = Array.isArray(e.data?.keys) ? e.data.keys.filter((k): k is string => typeof k === 'string') : []
      if (keys.length === 0) return
      void refreshStored(keys).then(emitOtherTab)
    }
    return 'indexeddb'
  } catch (err) {
    openError = err
    d?.close()
    return 'localStorage'
  }
}

/** 閉じる（テストで、タブを閉じた代わりに使う。閉じた後は書き込みが失敗する） */
export function closeDataStore(): void {
  channel?.close()
  channel = null
  db?.close()
}
