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
let onWriteError: ((err: unknown) => void) | null = null

export function setPersistWriteErrorHandler(handler: (err: unknown) => void) {
  onWriteError = handler
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
    try {
      localStorage.setItem(key, value)
      lastKnownRaw = value
      writeFailed = false
    } catch (err) {
      writeFailed = true
      onWriteError?.(err)
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
