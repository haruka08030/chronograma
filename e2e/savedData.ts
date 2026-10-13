import type { Page } from '@playwright/test'

/**
 * 端末に保存した本体（zustand の persist の保存内容）の文字列。IndexedDB（`chronograma-data`）から読む（`src/lib/dataStore.ts`）。
 * localStorage には残っていないことも確かめる（移し替えた後に古い置き場所へ書いていない）
 */
export async function savedRaw(page: Page): Promise<string | null> {
  return page.evaluate(
    () =>
      new Promise<string | null>((resolve, reject) => {
        if (localStorage.getItem('chronograma-storage') !== null) reject(new Error('the saved data is still in localStorage'))
        const req = indexedDB.open('chronograma-data')
        req.onsuccess = () => {
          const db = req.result
          if (!db.objectStoreNames.contains('kv')) {
            db.close()
            resolve(null)
            return
          }
          const tx = db.transaction('kv', 'readonly')
          const get = tx.objectStore('kv').get('chronograma-storage')
          tx.oncomplete = () => {
            db.close()
            resolve((get.result as string | undefined) ?? null)
          }
          tx.onabort = () => reject(tx.error)
        }
        req.onerror = () => reject(req.error)
      }),
  )
}

/** 保存した本体の `state` */
export async function savedState(page: Page): Promise<{ tasks: Record<string, unknown>[] } | null> {
  const raw = await savedRaw(page)
  return raw ? (JSON.parse(raw) as { state: { tasks: Record<string, unknown>[] } }).state : null
}
