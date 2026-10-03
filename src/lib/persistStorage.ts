/**
 * ストアの保存先（localStorage）。zustand の既定の保存先の代わりに使い、次の 2 つを足す。
 *
 * - 他のタブが書いた内容を取り込むあいだは書き戻さない（書き戻すとタブ同士で表示中の画面を
 *   上書きし合い、storage イベントが往復し続ける）
 * - 最後に自分が書いた・取り込んだ文字列を覚えておき、他のタブの変更かどうかを見分ける
 */
import type { StateStorage } from 'zustand/middleware'

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

export const persistWriteFailed = () => writeFailed

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
