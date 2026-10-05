import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STALE_CHUNK_RELOAD_INTERVAL_MS, STALE_CHUNK_RELOAD_KEY, isChunkLoadError, reloadForStaleChunk } from './chunkLoad'

describe('isChunkLoadError', () => {
  it('ブラウザごとの「ファイルが取れなかった」を拾う', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://a/assets/x-1.js'))).toBe(true)
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true)
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module: https://a/x.js'))).toBe(true)
    expect(isChunkLoadError(new Error('Unable to preload CSS for /assets/x.css'))).toBe(true)
    expect(isChunkLoadError(Object.assign(new Error('Loading chunk 12 failed.'), { name: 'ChunkLoadError' }))).toBe(true)
  })

  it('それ以外のエラーは拾わない', () => {
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBe(false)
    expect(isChunkLoadError('Failed to fetch dynamically imported module')).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
  })
})

describe('reloadForStaleChunk', () => {
  const store = new Map<string, string>()
  const reload = vi.fn()

  beforeEach(() => {
    store.clear()
    reload.mockReset()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-05T10:00:00Z'))
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    })
    vi.stubGlobal('location', { reload })
    vi.stubGlobal('navigator', { onLine: true })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('1 回だけ読み込み直す（すぐ後にもう一度失敗しても繰り返さない）', () => {
    expect(reloadForStaleChunk()).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(store.get(STALE_CHUNK_RELOAD_KEY)).toBe(String(Date.now()))
    // 読み込み直した後の新しいページでも読めない
    vi.setSystemTime(Date.now() + 5_000)
    expect(reloadForStaleChunk()).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
    // しばらく経ってからのデプロイには、また 1 回だけ
    vi.setSystemTime(Date.now() + STALE_CHUNK_RELOAD_INTERVAL_MS)
    expect(reloadForStaleChunk()).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('オフラインでは読み込み直さない', () => {
    vi.stubGlobal('navigator', { onLine: false })
    expect(reloadForStaleChunk()).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('sessionStorage が使えなければ読み込み直さない（繰り返しを止められない）', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {},
    })
    expect(reloadForStaleChunk()).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })
})
