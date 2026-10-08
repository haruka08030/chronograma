/**
 * ストアの保存先（localStorage）。zustand の既定の保存先の代わりに使い、次の 2 つを足す。
 *
 * - 他のタブが書いた内容を取り込むあいだは書き戻さない（書き戻すとタブ同士で表示中の画面を
 *   上書きし合い、storage イベントが往復し続ける）
 * - 最後に自分が書いた・取り込んだ文字列を覚えておき、他のタブの変更かどうかを見分ける
 * - 保存する値（`partialize` の結果）がどれも前と同じ参照なら、文字列にもしない（`createPersistStorage`）
 */
import type { PersistStorage, StateStorage, StorageValue } from 'zustand/middleware'

let suppressWrites = false
/** この端末で最後に読み書きした保存内容（他のタブの書き込みと見分けるため） */
let lastKnownRaw: string | null = null
/** 保存に失敗した（容量不足など）。この間は保存より手元のほうが新しいので、保存から取り込まない */
let writeFailed = false
interface WriteHandlers {
  /** 保存に失敗した。場所を空けられたら true（もう一度だけ書いてみる） */
  freeSpace: () => boolean
  /** 空けても保存できなかった */
  onFailed: (err: unknown) => void
  /** 失敗のあと、また保存できるようになった */
  onRecovered: () => void
}
let handlers: WriteHandlers | null = null

export function setPersistWriteHandlers(h: WriteHandlers) {
  handlers = h
}

/** fn の間のストア更新を保存しない */
export function withoutPersisting(fn: () => void) {
  suppressWrites = true
  try {
    fn()
  } finally {
    suppressWrites = false
  }
}

/** 保存内容が、この端末が最後に読み書きしたものと違えば（＝他のタブが書いた）その文字列を返す */
export function readChangedRaw(key: string): string | null {
  if (writeFailed) return null
  let raw: string | null
  try {
    raw = localStorage.getItem(key)
  } catch {
    return null
  }
  if (raw === null || raw === lastKnownRaw) return null
  return raw
}

export function markRawKnown(raw: string) {
  lastKnownRaw = raw
}

export const persistStorage: StateStorage = {
  getItem: (key) => {
    try {
      const raw = localStorage.getItem(key)
      lastKnownRaw = raw
      return raw
    } catch {
      return null
    }
  },
  setItem: (key, value) => {
    if (suppressWrites) return
    // 中身が変わっていなければ書かない（画面の状態だけの変更で、全データを書き直して他のタブに読み直させない）
    if (value === lastKnownRaw && !writeFailed) return
    const write = () => {
      localStorage.setItem(key, value)
      lastKnownRaw = value
      if (writeFailed) {
        writeFailed = false
        handlers?.onRecovered()
      }
    }
    try {
      write()
    } catch (err) {
      // 容量不足（QuotaExceededError）など。投げると操作の途中で止まるので、ここで受けて知らせる
      if (handlers?.freeSpace()) {
        try {
          write()
          return
        } catch {
          /* 空けても足りなかった */
        }
      }
      writeFailed = true
      handlers?.onFailed(err)
    }
  },
  removeItem: (key) => {
    try {
      localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  },
}

/** 前に書いた値と、どの項目も同じ参照か */
function sameRefs(a: object, b: object): boolean {
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  return ka.every((k) => Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

/**
 * zustand の persist に渡す保存先（`createJSONStorage(() => persistStorage)` の代わり）。
 * persist は `setState` のたびに保存先を呼ぶので、検索欄の 1 文字・ドラッグ中のリストの上を通る・同期の状態の切り替えなど
 * 保存しない値が変わっただけでも全データを `JSON.stringify` していた（5,000 件で 1 回 約 4 ms）。
 * 保存する値がどれも前に書いたときと同じ参照なら、文字列にせずに戻る（#266）
 */
export function createPersistStorage<S>(): PersistStorage<S> {
  let lastWritten: StorageValue<S> | null = null
  return {
    getItem: (name) => {
      const raw = persistStorage.getItem(name) as string | null
      return raw === null ? null : (JSON.parse(raw) as StorageValue<S>)
    },
    setItem: (name, value) => {
      if (suppressWrites) return
      const prev = lastWritten
      if (
        prev &&
        !writeFailed &&
        prev.version === value.version &&
        typeof prev.state === 'object' &&
        prev.state !== null &&
        typeof value.state === 'object' &&
        value.state !== null &&
        sameRefs(prev.state, value.state)
      )
        return
      lastWritten = value
      persistStorage.setItem(name, JSON.stringify(value))
    },
    removeItem: (name) => {
      lastWritten = null
      persistStorage.removeItem(name)
    },
  }
}
