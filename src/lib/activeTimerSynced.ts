// 動いているタイマーを合わせ終えた知らせ（同期の `timerSync` が送り、通知から開いた「止める」が待つ）。
// 起動時に読む通知の処理から使うので、同期の本体（ログインしてから読む）とは分けておく

const syncedListeners = new Set<() => void>()

/** 動いているタイマーを 1 回合わせ終えたとき（失敗した回も）に呼ばれる。通知の「止める」が、別の端末で止めた古いタイマーを止めないように待つ */
export function onActiveTimerSynced(fn: () => void): () => void {
  syncedListeners.add(fn)
  return () => void syncedListeners.delete(fn)
}

export function notifyActiveTimerSynced(): void {
  for (const fn of [...syncedListeners]) fn()
}
