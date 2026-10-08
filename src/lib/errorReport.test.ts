import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const insert = vi.fn()
vi.mock('./supabase', () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({ from: () => ({ insert }) }),
}))

const {
  LIMITS,
  MAX_PENDING_REPORTS,
  MAX_REPORTS_PER_HOUR,
  PAUSE_AFTER_FAILURE_MS,
  PENDING_REPORTS_KEY,
  REPORT_WINDOW_MS,
  SAME_ERROR_INTERVAL_MS,
  buildReport,
  flushErrorReports,
  pageLocation,
  redact,
  reportError,
  reportFailure,
  reportSyncError,
  resetErrorReportForTests,
  setErrorReportUser,
  topFrame,
  truncate,
} = await import('./errorReport')

function errorAt(message: string, frame: string): Error {
  const e = new Error(message)
  e.stack = `Error: ${message}\n    at ${frame} (https://app.example/assets/a.js:1:2)\n    at other (https://app.example/assets/b.js:3:4)`
  return e
}

/** localStorage の代わり（unit のテストは node で動くので無い） */
function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    map,
  }
}
let storage: ReturnType<typeof memoryStorage>

beforeEach(() => {
  resetErrorReportForTests()
  storage = memoryStorage()
  vi.stubGlobal('localStorage', storage)
  insert.mockReset()
  insert.mockResolvedValue({ error: null })
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-05T10:00:00Z'))
  vi.stubGlobal('location', { href: 'https://app.example/?view=calendar&code=secret#access_token=abc' })
  vi.stubGlobal('navigator', { onLine: true, userAgent: 'TestAgent/1.0' })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('reportError', () => {
  it('ログインしていなければ送らない', async () => {
    reportError('error', new Error('x'))
    await flushErrorReports()
    expect(insert).not.toHaveBeenCalled()
  })

  it('ログインしていない間の失敗はためておき、ログインしたらまとめて 1 回で送る', async () => {
    const quota = new Error('quota')
    reportError('storage', quota, { stage: 'save' })
    reportError('storage', quota, { stage: 'save' }) // 同じエラーは 1 件
    reportError('push', new Error('denied'))
    await flushErrorReports()
    expect(insert).not.toHaveBeenCalled()
    expect(JSON.parse(storage.getItem(PENDING_REPORTS_KEY)!)).toHaveLength(2)
    setErrorReportUser('u1')
    await flushErrorReports()
    expect(insert).toHaveBeenCalledTimes(1)
    const rows = insert.mock.calls[0][0]
    expect(rows.map((r: { kind: string }) => r.kind)).toEqual(['storage', 'push'])
    // 起きた時刻は extra に残す（created_at は送った時刻）
    expect(rows[0].extra).toEqual({ stage: 'save', occurred_at: '2026-10-05T10:00:00.000Z' })
    expect(storage.getItem(PENDING_REPORTS_KEY)).toBeNull()
  })

  it('ためておくのは新しい数件まで。起動し直してもログインしたら送る', async () => {
    for (let i = 0; i < MAX_PENDING_REPORTS + 5; i++) reportError('storage', new Error(`e${i}`))
    // 起動し直した（手元の状態は消え、localStorage だけ残る）
    const saved = storage.getItem(PENDING_REPORTS_KEY)
    resetErrorReportForTests()
    storage.setItem(PENDING_REPORTS_KEY, saved!)
    setErrorReportUser('u1')
    await flushErrorReports()
    const rows = insert.mock.calls[0][0]
    expect(rows).toHaveLength(MAX_PENDING_REPORTS)
    expect(rows[0].message).toBe('e5')
  })

  it('オフラインの間の失敗はためておき、回線が戻ってからログインし直すと送る', async () => {
    setErrorReportUser('u1')
    vi.stubGlobal('navigator', { onLine: false, userAgent: 'x' })
    reportError('storage', new Error('offline quota'))
    await flushErrorReports()
    expect(insert).not.toHaveBeenCalled()
    vi.stubGlobal('navigator', { onLine: true, userAgent: 'x' })
    setErrorReportUser('u1')
    await flushErrorReports()
    expect(insert.mock.calls[0][0][0].message).toBe('offline quota')
  })

  it('ログイン中は 1 行送る。場所はパスと view だけ', async () => {
    setErrorReportUser('u1')
    reportError('render', errorAt('boom', 'Foo'), { scope: 'screen' })
    await flushErrorReports()
    expect(insert).toHaveBeenCalledTimes(1)
    const row = insert.mock.calls[0][0]
    expect(row).toMatchObject({
      kind: 'render',
      message: 'boom',
      url: '/?view=calendar',
      user_agent: 'TestAgent/1.0',
      extra: { scope: 'screen' },
    })
    expect(row).not.toHaveProperty('user_id')
    expect(JSON.stringify(row)).not.toContain('secret')
    expect(JSON.stringify(row)).not.toContain('abc')
  })

  it('同じエラー（種類・メッセージ・スタックの先頭）は 10 分に 1 回', async () => {
    setErrorReportUser('u1')
    reportError('error', errorAt('same', 'Foo'))
    reportError('error', errorAt('same', 'Foo'))
    // スタックの先頭が違えば別のエラー
    reportError('error', errorAt('same', 'Bar'))
    // 種類が違えば別のエラー
    reportError('unhandledrejection', errorAt('same', 'Foo'))
    await flushErrorReports()
    expect(insert).toHaveBeenCalledTimes(3)
    vi.setSystemTime(Date.now() + SAME_ERROR_INTERVAL_MS - 1)
    reportError('error', errorAt('same', 'Foo'))
    await flushErrorReports()
    expect(insert).toHaveBeenCalledTimes(3)
    vi.setSystemTime(Date.now() + 1)
    reportError('error', errorAt('same', 'Foo'))
    await flushErrorReports()
    expect(insert).toHaveBeenCalledTimes(4)
  })

  it('1 時間に送るのは上限まで。開いたままでも 1 時間たてばまた送る', async () => {
    setErrorReportUser('u1')
    for (let i = 0; i < MAX_REPORTS_PER_HOUR + 10; i++) {
      reportError('error', new Error(`e${i}`))
      await flushErrorReports()
    }
    expect(insert).toHaveBeenCalledTimes(MAX_REPORTS_PER_HOUR)
    vi.setSystemTime(Date.now() + REPORT_WINDOW_MS)
    reportError('error', new Error('next hour'))
    await flushErrorReports()
    expect(insert).toHaveBeenCalledTimes(MAX_REPORTS_PER_HOUR + 1)
  })

  it('送るのを待っている数が多ければ捨てる', async () => {
    setErrorReportUser('u1')
    let release!: () => void
    insert.mockReturnValue(new Promise((r) => (release = () => r({ error: null }))))
    for (let i = 0; i < 10; i++) reportError('error', new Error(`q${i}`))
    release()
    await flushErrorReports()
    expect(insert.mock.calls.length).toBeLessThanOrEqual(5)
  })

  it('送れなかったら再送せず、しばらく送らない', async () => {
    setErrorReportUser('u1')
    insert.mockResolvedValueOnce({ error: { message: 'relation does not exist' } })
    reportError('error', new Error('first'))
    await flushErrorReports()
    reportError('error', new Error('second'))
    await flushErrorReports()
    expect(insert).toHaveBeenCalledTimes(1)
    vi.setSystemTime(Date.now() + PAUSE_AFTER_FAILURE_MS + 1)
    reportError('error', new Error('third'))
    await flushErrorReports()
    expect(insert).toHaveBeenCalledTimes(2)
    expect(insert.mock.calls[1][0].message).toBe('third')
  })

  it('送信が例外でも投げない', async () => {
    setErrorReportUser('u1')
    insert.mockRejectedValueOnce(new Error('network down'))
    expect(() => reportError('error', new Error('x'))).not.toThrow()
    await expect(flushErrorReports()).resolves.toBeUndefined()
  })

  it('オフラインでは送らない', async () => {
    setErrorReportUser('u1')
    vi.stubGlobal('navigator', { onLine: false, userAgent: 'x' })
    reportError('error', new Error('offline'))
    await flushErrorReports()
    expect(insert).not.toHaveBeenCalled()
  })

  it('ログアウトしたら送らない', async () => {
    setErrorReportUser('u1')
    setErrorReportUser(null)
    reportError('error', new Error('x'))
    await flushErrorReports()
    expect(insert).not.toHaveBeenCalled()
  })

  it('Error 以外（文字列・オブジェクト・循環）も送れる', async () => {
    setErrorReportUser('u1')
    const circular: Record<string, unknown> = {}
    circular.self = circular
    reportError('unhandledrejection', 'plain')
    reportError('unhandledrejection', { code: 42 })
    reportError('unhandledrejection', circular)
    await flushErrorReports()
    expect(insert.mock.calls.map((c) => c[0].message)).toEqual(['plain', '{"code":42}', '[object Object]'])
  })
})

describe('reportSyncError', () => {
  it('回線の失敗は送らない', async () => {
    setErrorReportUser('u1')
    reportSyncError('pull', 'TypeError: Failed to fetch')
    reportSyncError('push', new TypeError('Load failed'))
    await flushErrorReports()
    expect(insert).not.toHaveBeenCalled()
  })

  it('それ以外は段階を付けて送る', async () => {
    setErrorReportUser('u1')
    reportSyncError('push', 'row_limit_exceeded')
    await flushErrorReports()
    expect(insert.mock.calls[0][0]).toMatchObject({ kind: 'sync', message: 'push: row_limit_exceeded', extra: { stage: 'push' } })
  })
})

describe('reportFailure', () => {
  it('種類と段階を付けて送る', async () => {
    setErrorReportUser('u1')
    reportFailure('storage', 'save', new DOMException('full', 'QuotaExceededError'))
    reportFailure('integration', 'canvas', new Error('token expired'), { code: 'canvas_unauthorized' })
    reportFailure('push', 'save', 'row_limit_exceeded', { code: 'P0001' })
    await flushErrorReports()
    expect(insert.mock.calls.map((c) => c[0])).toMatchObject([
      { kind: 'storage', message: 'QuotaExceededError: full', extra: { stage: 'save' } },
      { kind: 'integration', message: 'token expired', extra: { stage: 'canvas', code: 'canvas_unauthorized' } },
      { kind: 'push', message: 'save: row_limit_exceeded', extra: { stage: 'save', code: 'P0001' } },
    ])
  })

  it('回線の失敗は送らない', async () => {
    setErrorReportUser('u1')
    reportFailure('integration', 'notion', new TypeError('Failed to fetch'))
    await flushErrorReports()
    expect(insert).not.toHaveBeenCalled()
  })
})

describe('切り詰めと伏せ字', () => {
  it('DB の上限に切り詰める', () => {
    const row = buildReport('error', Object.assign(new Error('m'.repeat(5000)), { stack: 's'.repeat(20000) }), {
      big: 'x'.repeat(10000),
    })
    expect(row.message.length).toBeLessThanOrEqual(LIMITS.message)
    expect(row.stack!.length).toBeLessThanOrEqual(LIMITS.stack)
    expect(new TextEncoder().encode(JSON.stringify(row.extra)).length).toBeLessThanOrEqual(LIMITS.extra)
  })

  it('サロゲートペアを半分で切らない', () => {
    const out = truncate('a' + '😀'.repeat(10), 4)
    expect(out.length).toBeLessThanOrEqual(4)
    expect(out).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/)
  })

  it('トークン・JWT・メールアドレスを伏せる', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'
    const text = redact(`GET /cb?code=abc123&state=xyz#access_token=${jwt}&refresh_token=r1 by user@example.com Bearer tok.en`)
    expect(text).not.toContain('abc123')
    expect(text).not.toContain('xyz')
    expect(text).not.toContain(jwt)
    expect(text).not.toContain('r1')
    expect(text).not.toContain('user@example.com')
    expect(text).not.toContain('tok.en')
  })

  it('場所はパスと view だけ', () => {
    expect(pageLocation('https://a.example/?view=stats&list=x&code=1#access_token=2')).toBe('/?view=stats')
    expect(pageLocation('https://a.example/auth/callback?code=1')).toBe('/auth/callback')
    expect(pageLocation('not a url')).toBe('')
  })

  it('スタックの先頭の行（Chrome・Firefox / Safari）', () => {
    expect(topFrame('Error: x\n    at Foo (a.js:1:2)\n    at Bar (b.js:3:4)')).toBe('at Foo (a.js:1:2)')
    expect(topFrame('Foo@https://a/a.js:1:2\nBar@https://a/b.js:3:4')).toBe('Foo@https://a/a.js:1:2')
    expect(topFrame(undefined)).toBe('')
  })
})
