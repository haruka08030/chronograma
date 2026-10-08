/**
 * 入力欄で打っている途中の、まだストアに入れていない書きかけ（メモ・場所）。
 * 欄は少し止まったときにストアへ入れる（1 文字ごとに全データを保存し、他のタブに読み直させないため）。
 * タブを閉じる・裏に回す・読み込み直すときは、待たずにここから全部入れる（ストアに入れた時点で保存される）
 */
const flushers = new Set<() => void>()

/** 書きかけを登録する。返した関数で外す */
export function registerPendingEdit(flush: () => void): () => void {
  flushers.add(flush)
  return () => {
    flushers.delete(flush)
  }
}

/** 書きかけをすべてストアに入れる */
export function flushPendingEdits(): void {
  for (const flush of [...flushers]) {
    try {
      flush()
    } catch (err) {
      console.error('[pendingEdits] flush failed', err)
    }
  }
}

if (typeof window !== 'undefined') {
  // iPhone の PWA は閉じても pagehide が来ないことがあるので、裏に回ったときにも入れる
  window.addEventListener('pagehide', flushPendingEdits)
  window.addEventListener('beforeunload', flushPendingEdits)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPendingEdits()
  })
}
