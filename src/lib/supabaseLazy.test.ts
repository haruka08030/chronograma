import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ログインしない人には `@supabase/supabase-js` を読ませない（#268）。
 * ライブラリは評価されたら印を付ける偽物にして、いつ読まれたかを見る
 */
const lib = vi.hoisted(() => ({ evaluated: false, createClient: null as unknown as ReturnType<typeof vi.fn> }))
vi.mock('@supabase/supabase-js', () => {
  lib.evaluated = true
  lib.createClient = vi.fn(() => ({ auth: {} }))
  return { createClient: lib.createClient }
})

/** 保存領域の代わり（unit は node で動くので localStorage が無い） */
function fakeStorage(entries: Record<string, string> = {}) {
  const map = new Map(Object.entries(entries))
  return {
    get length() {
      return map.size
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  }
}

async function load(storage = fakeStorage()) {
  vi.stubGlobal('localStorage', storage)
  vi.resetModules()
  lib.evaluated = false
  return import('./supabase')
}

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon')
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('Supabase は必要になってから読む', () => {
  it('つなぎ口を読み込んでもライブラリは読まない。ログインしていなければ起動時にも読まない', async () => {
    const m = await load()
    expect(m.isSupabaseConfigured).toBe(true)
    expect(lib.evaluated).toBe(false)
    expect(m.getSupabase()).toBeNull()
    expect(m.needsSupabaseAtStart()).toBe(false)
  })

  it('セッションが保存されている・ログインから戻ってきたときは起動時に読む', async () => {
    const m = await load(fakeStorage({ 'sb-abcd-auth-token': '{}' }))
    expect(m.hasStoredSession()).toBe(true)
    expect(m.needsSupabaseAtStart()).toBe(true)
    expect(m.isAuthRedirect('#access_token=x&refresh_token=y&type=magiclink')).toBe(true)
    // 失敗の戻り（`#error=…`）にはセッションが無い。ほかのキーはセッションではない
    expect(m.isAuthRedirect('#error=access_denied&error_code=otp_expired')).toBe(false)
    expect((await load(fakeStorage({ 'sb-abcd-auth-token-code-verifier': 'x', other: '1' }))).hasStoredSession()).toBe(false)
  })

  it('loadSupabase で 1 回だけ読んで作り、読み込みを待っている人に知らせる', async () => {
    const m = await load()
    const loaded = vi.fn()
    m.onSupabaseLoaded(loaded)
    const [a, b] = await Promise.all([m.loadSupabase(), m.loadSupabase()])
    expect(lib.evaluated).toBe(true)
    expect(lib.createClient).toHaveBeenCalledTimes(1)
    expect(lib.createClient).toHaveBeenCalledWith('https://example.supabase.co', 'anon', expect.anything())
    expect(a).toBe(b)
    expect(m.getSupabase()).toBe(a)
    expect(loaded).toHaveBeenCalledWith(a)
    // 読み込み済みなら登録したときにすぐ呼ぶ
    const late = vi.fn()
    m.onSupabaseLoaded(late)
    expect(late).toHaveBeenCalledWith(a)
  })

  it('設定が無ければ読まずに null', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    const m = await load()
    expect(await m.loadSupabase()).toBeNull()
    expect(lib.evaluated).toBe(false)
  })
})

describe('起動時に読むソースの形', () => {
  // テスト以外の src のソースを文字のまま読む
  const sources = import.meta.glob(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}', '!../test/**'], {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>

  it('`@supabase/supabase-js` を型以外で静的に読むのは無い（読むのは lib/supabase.ts の import() だけ）', () => {
    const offenders = Object.entries(sources)
      .filter(([, text]) => /^import\s+(?!type\b)[^'"]*from\s+'@supabase\/supabase-js'/m.test(text))
      .map(([file]) => file)
    expect(offenders).toEqual([])
    expect(sources['./supabase.ts']).toContain("import('@supabase/supabase-js')")
  })

  it('言語の文言（locales/ja・en）を静的に読むのは無い（読むのは i18n/config.ts の import() だけ）', () => {
    const offenders = Object.entries(sources)
      .filter(([file]) => !file.startsWith('../locales/'))
      .filter(([, text]) => /^import\s[^'"]*from\s+'[./]+locales\/(ja|en)'/m.test(text) || /from\s+'date-fns\/locale'/.test(text))
      .map(([file]) => file)
    expect(offenders).toEqual([])
    expect(sources['../i18n/config.ts']).toContain("import('../locales/ja')")
    expect(sources['../i18n/config.ts']).toContain("import('../locales/en')")
  })
})
