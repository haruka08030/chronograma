/**
 * 端末の保存領域を「消されにくい」ものにしてほしいと頼む（`navigator.storage.persist()`）。
 * 頼まないと、容量が少なくなったときにブラウザがこのサイトのデータ（本体・前回同期の控え・自動バックアップ）を消しうる。
 * ブラウザによっては確かめの表示が出るので、同期が一度できた後に、端末ごとに 1 回だけ頼む
 */
const ASKED_KEY = 'chronograma-storage-persist-asked'

export async function requestPersistentStorage(): Promise<void> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return
    if (localStorage.getItem(ASKED_KEY)) return
    localStorage.setItem(ASKED_KEY, '1')
    if (await navigator.storage.persisted()) return
    await navigator.storage.persist()
  } catch {
    /* 頼めなくても動きは変わらない */
  }
}
