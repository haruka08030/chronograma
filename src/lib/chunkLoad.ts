/**
 * 遅れて読むファイル（画面・詳細・メニュー）が読めなかったときの判定と、デプロイ直後の古いタブの再読み込み
 */

/** 再読み込みした時刻（sessionStorage）。`main.tsx` の `vite:preloadError` と共用 */
export const STALE_CHUNK_RELOAD_KEY = 'chronograma_preload_reload_at'
/** この間に 2 回は再読み込みしない（新しい版でも読めないときに繰り返さない） */
export const STALE_CHUNK_RELOAD_INTERVAL_MS = 60_000

/** ファイルが取れなかった失敗か（デプロイで古いファイル名が消えた・回線が無い）。ブラウザ・バンドラーごとの文言 */
export function isChunkLoadError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const { name, message } = err as { name?: unknown; message?: unknown }
  if (name === 'ChunkLoadError') return true
  if (typeof message !== 'string') return false
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|Loading (CSS )?chunk [\w-]+ failed/i.test(
    message,
  )
}

/**
 * デプロイ直後の古いタブなら、1 回だけ読み込み直して新しい版にする。読み込み直したら true。
 * オフライン（読み込み直しても開けない）・直前に読み込み直した（新しい版でも読めない）ときはしない
 */
export function reloadForStaleChunk(): boolean {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false
    const last = Number(sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY) ?? 0)
    if (Date.now() - last < STALE_CHUNK_RELOAD_INTERVAL_MS) return false
    sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, String(Date.now()))
  } catch {
    // sessionStorage が使えないと繰り返しを止められないので、読み込み直さない
    return false
  }
  location.reload()
  return true
}
