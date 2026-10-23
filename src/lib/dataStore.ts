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
import { reloadPage } from './reloadPage'

export const BASELINE_KEY_PREFIX = 'chronograma-sync-baseline-v1:'
/** 設定ごとの「手元の値のもとにしたサーバーの版」と、その版の中身の控え（`settingSync.ts`、利用者ごと） */
export const SETTINGS_SYNCED_KEY_PREFIX = 'chronograma-settings-sync-v1:'
export const SETTINGS_BASE_KEY_PREFIX = 'chronograma-settings-base-v1:'
const isSettingsKey = (key: string) => key.startsWith(SETTINGS_SYNCED_KEY_PREFIX) || key.startsWith(SETTINGS_BASE_KEY_PREFIX)
/** 「どこまでサーバーと合わせたか」の記録（前回同期の控え・設定の版）。本体と食い違うと、古い本体を「手元で変えた」と読む */
const isSyncRecord = (key: string) => key.startsWith(BASELINE_KEY_PREFIX) || isSettingsKey(key)
/** 前回取得したサーバーの内容と差分の目印（`syncPull.ts` の `savePullState`、利用者ごと） */
export const PULL_STATE_KEY_PREFIX = 'chronograma-sync-mirror-v1:'
const DB_NAME = 'chronograma-data'
const STORE = 'kv'
const META = 'meta'
/** localStorage から移したことの印（`meta` に置く。移すのは 1 回だけ） */
const MIGRATED = 'migratedFromLocalStorage'
/** 設定の版（前は localStorage に置いていた）を移したことの印。この後に localStorage にあれば、localStorage で動いた回が書いたもの */
const SETTINGS_MIGRATED = 'migratedSettingsFromLocalStorage'
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
  enqueue(key, { value, at: Date.now(), ...callbacks })
  // どこまで合わせたかの記録は、本体と同じトランザクションで書く。本体をもう前のトランザクションで書いている途中なら
  // （同期で取り込んだ変更を書いた後に、送るものが無くすぐ控えを書いた）、本体もいまの値でもう一度一緒に書く。
  // 本体が書けなければ記録も書かれない（本体は古いのに記録だけ新しい、にならない）。消すのは本体と食い違わないので待たない
  if (value !== null && isSyncRecord(key) && busy.has(PERSIST_STORAGE_KEY) && !queue.has(PERSIST_STORAGE_KEY))
    enqueue(PERSIST_STORAGE_KEY, { value: cache.get(PERSIST_STORAGE_KEY) ?? null, at: Date.now() })
  if (!flushScheduled) {
    flushScheduled = true
    queueMicrotask(flush)
  }
}

function enqueue(key: string, w: PendingWrite) {
  if (!queue.has(key)) busy.set(key, (busy.get(key) ?? 0) + 1)
  queue.set(key, w)
}

function flush() {
  flushScheduled = false
  const batch = queue
  queue = new Map()
  if (batch.size === 0) return
  for (const [key, w] of batch) lastWrite.set(key, { value: w.value, at: w.at })
  writeBatch(batch, false)
}

function writeBatch(batch: Map<string, PendingWrite>, retried: boolean) {
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
    } else {
      if (lost && !closedForGood) {
        // 書けなかった分は、次に開いたときに書く（閉じるのを待たずに置く。iOS は閉じる合図なしにページを捨てることがある）
        for (const [key, w] of batch) lostWrites.set(key, w.at)
        keepUnsavedForNextOpen()
      }
      for (const w of batch.values()) w.onError?.(err)
    }
    if (busy.size === 0) for (const resolve of savedWaiters.splice(0)) resolve()
  }
  const failed = (err: unknown) => {
    // 接続が切れた（iOS の Safari は裏に長く回したあとに落とすことがある）: 1 回だけ開き直して書き直す。だめなら再読み込みを促す
    if (!retried && !lost && isConnectionLost(err)) {
      void reconnect().then((ok) => (ok ? writeBatch(batch, true) : finish(err)))
      return
    }
    if (!lost && isConnectionLost(err)) markLost()
    finish(err)
  }
  let tx: IDBTransaction | null = null
  try {
    if (!db || dbClosed) throw new DOMException('the data store is closed', 'InvalidStateError')
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
    failed(err)
    return
  }
  const t = tx
  t.oncomplete = () => finish(null)
  t.onabort = () => failed(t.error ?? new DOMException('the write was aborted', 'AbortError'))
}

/**
 * 接続が切れた（ブラウザが閉じた `onclose`・新しい版のタブが開き直した `onversionchange`）。容量不足（`QuotaExceededError`）とは分ける
 */
let dbClosed = false
/** 開き直せなかった。開いている間はもう書けないので、再読み込みを促す（`onDataStoreLost`） */
let lost = false
/** 開き直さない（テストでタブを閉じた） */
let closedForGood = false
const lostListeners = new Set<() => void>()
/** 書けなかったキーと書いた時刻（閉じる前に localStorage に置き、次に開いたときに書く） */
const lostWrites = new Map<string, number>()

function isConnectionLost(err: unknown): boolean {
  if (dbClosed || closedForGood) return true
  if (!(err instanceof DOMException)) return false
  return err.name === 'InvalidStateError' || err.name === 'UnknownError' || /connection/i.test(err.message)
}

function markLost() {
  if (lost || closedForGood) return
  lost = true
  lostListeners.forEach((l) => l())
}

/** 保存先との接続が切れて、開き直せなかったか（再読み込みを促す。容量不足とは別） */
export function dataStoreLost(): boolean {
  return lost
}

export function onDataStoreLost(listener: () => void): () => void {
  lostListeners.add(listener)
  return () => lostListeners.delete(listener)
}

let reconnecting: Promise<boolean> | null = null
/** 開き直す（同時に失敗した書き込みは同じ 1 回を待つ）。手元の写しはこのタブのものが新しいので読み直さない */
function reconnect(): Promise<boolean> {
  if (closedForGood) return Promise.resolve(false)
  reconnecting ??= withTimeout(openDb(), OPEN_TIMEOUT_MS, (late) => late.close())
    .then((d) => {
      try {
        db?.close()
      } catch {
        /* もう閉じている */
      }
      adoptDb(d)
      return true
    })
    .catch(() => {
      markLost()
      return false
    })
    .finally(() => {
      reconnecting = null
    })
  return reconnecting
}

/** 開いた接続を使う。切れた・新しい版のタブが開き直したいときは閉じて、次の書き込みで開き直す */
function adoptDb(d: IDBDatabase) {
  db = d
  dbClosed = false
  d.onclose = () => {
    if (db === d) dbClosed = true
  }
  d.onversionchange = () => {
    // 閉じないと新しい版のタブが開けない（古い版のまま書き続けない。次の書き込みは開き直せず、再読み込みを促す）
    d.close()
    if (db === d) dbClosed = true
  }
}

/** 書き終えてから読み込み直す（書いていなければその場で） */
export function reloadWhenSaved(): void {
  if (!db || busy.size === 0) reloadPage()
  else void whenSaved().then(reloadPage)
}

const savedWaiters: (() => void)[] = []
/**
 * いま書いている分を書き終えるまで待つ（読み込み直す前に。書き終える前に読み込み直すと、その編集が消える）。
 * localStorage・書いていなければすぐ。いつまでも待たない（`timeoutMs`）
 */
export function whenSaved(timeoutMs = 3000): Promise<void> {
  if (!db || busy.size === 0) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs)
    savedWaiters.push(() => {
      clearTimeout(timer)
      resolve()
    })
  })
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
  if (!db || (busy.size === 0 && lostWrites.size === 0)) return
  const unsaved: Record<string, { value: string | null; at: number }> = {}
  // 書けなかった分はいまの値で（手元の写しはこのタブの最後に書いた値）
  for (const [key, at] of lostWrites) unsaved[key] = { value: cache.get(key) ?? null, at }
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

/** localStorage にある、移すもの（[IndexedDB のキー, 中身, localStorage のキー]）。本体・前回同期の控え・設定の版 */
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
      if (!key || !(key.startsWith(BASELINE_KEY_PREFIX) || isSettingsKey(key))) continue
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
/** その回の控えで置き換える前の、IndexedDB の控え（キーはこの後に控えのキー）。取り込んだら消す */
export const RECOVERED_BASELINE_PREFIX = `${RECOVERED_LOCAL_KEY}-baseline:`

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
function loadAll(
  d: IDBDatabase,
): Promise<{ entries: Map<string, string>; copied: [string, string, string][]; recovered: boolean; dropped: string[] }> {
  return new Promise((resolve, reject) => {
    const entries = new Map<string, string>()
    const copied: [string, string, string][] = []
    let recovered = false
    /** IndexedDB の設定の版を捨てる（localStorage で動いた回があった）。`dropped` は消す localStorage のキー */
    let dropSettings = false
    let dropped: string[] = []
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
        else if (dropSettings && isSettingsKey(key)) c.delete()
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
    const settingsMarker = meta.get(SETTINGS_MIGRATED)
    settingsMarker.onsuccess = () => {
      const all = localStorageEntries()
      const settings = all.filter(([key]) => isSettingsKey(key))
      const local = all.filter(([key]) => !isSettingsKey(key))
      // 設定の版は前の版まで localStorage に置いていた。初めてなら本体と一緒に移す。移した後に localStorage にあるのは
      // localStorage で動いた回が書いたもので、どの本体の版なのかが分からない。localStorage で動いた回の本体を取り込むときも、
      // 合わせた本体の設定はどちらの回の値か設定ごとに違う。どちらも設定の版を捨てる（次の同期は編集時刻で比べる）
      const recovering = marker.result !== undefined && local.length > 0
      if (settingsMarker.result === undefined) meta.put(new Date().toISOString(), SETTINGS_MIGRATED)
      if (recovering || (settingsMarker.result !== undefined && settings.length > 0)) {
        dropSettings = true
        dropped = settings.map(([, , from]) => from)
      } else if (settings.length > 0) {
        copied.push(...settings)
        for (const [key, value] of settings) kv.put(value, key)
      }
      if (marker.result === undefined) {
        copied.push(...local)
        for (const [key, value] of local) kv.put(value, key)
        meta.put(new Date().toISOString(), MIGRATED)
        readAll()
        return
      }
      if (local.length === 0) {
        readAll()
        return
      }
      recovered = true
      const recoveredEntries = local.map(([key, value, from]): [string, string, string] => [
        key === PERSIST_STORAGE_KEY ? RECOVERED_LOCAL_KEY : key,
        value,
        from,
      ])
      copied.push(...recoveredEntries)
      // その回の控えで置き換える前の控え（IndexedDB の本体と同期した版）を残す。その回で完全に消した行
      // （IndexedDB の本体にだけ残る）を、この端末で足した行と読み違えて送り直さないために比べる（`store/recoverLocal.ts`）
      const replaced = recoveredEntries.filter(([key]) => key.startsWith(BASELINE_KEY_PREFIX))
      let pending = replaced.length
      const putAll = () => {
        for (const [key, value] of recoveredEntries) kv.put(value, key)
        readAll()
      }
      if (pending === 0) putAll()
      for (const [key] of replaced) {
        const prev = kv.get(key)
        prev.onsuccess = () => {
          if (typeof prev.result === 'string') kv.put(prev.result, `${RECOVERED_BASELINE_PREFIX}${key}`)
          if (--pending === 0) putAll()
        }
      }
    }
    tx.oncomplete = () => {
      try {
        localStorage.removeItem(UNSAVED_KEY)
      } catch {
        /* ignore */
      }
      resolve({ entries, copied, recovered, dropped })
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
      tx.objectStore(META).delete(SETTINGS_MIGRATED)
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
    const { entries, copied, recovered, dropped } = await loadAll(d)
    for (const key of dropped) {
      try {
        localStorage.removeItem(key)
      } catch {
        /* ignore */
      }
    }
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
    adoptDb(d)
    try {
      localStorage.setItem(IN_INDEXED_DB_KEY, '1')
    } catch {
      /* 印が無ければ、開けなかった回は前と同じく localStorage で動く */
    }
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

/** この端末のデータを IndexedDB に置いている印（一度開けたら付ける）。開けなかった回を空のまま始めないために見る */
const IN_INDEXED_DB_KEY = 'chronograma-data-in-indexeddb'

/**
 * IndexedDB を開けなかったのに、この端末のデータは IndexedDB にある（前に開けた）。空の localStorage のまま書き始めると、
 * データが全部消えたように見え、作り直したものが次に開いたときに合わさる。保存を止めて再読み込みを促す（`main.tsx`）
 */
export function dataStoreUnavailable(): boolean {
  if (db || openError === null) return false
  try {
    return localStorage.getItem(IN_INDEXED_DB_KEY) !== null
  } catch {
    return false
  }
}

/** 閉じる（テストで、タブを閉じた代わりに使う。閉じた後は書き込みが失敗する） */
export function closeDataStore(): void {
  closedForGood = true
  channel?.close()
  channel = null
  db?.close()
}
