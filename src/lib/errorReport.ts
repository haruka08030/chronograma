/**
 * 端末で起きたエラーを Supabase の表 `client_errors`（`011_client_errors.sql`）に送る。外部のサービスは使わない。
 * - 送るのはログイン中で Supabase の設定があるときだけ（`setErrorReportUser` は AuthProvider が呼ぶ）
 * - 同じエラー（種類・メッセージ・スタックの先頭の行）は 10 分に 1 回まで、1 回の起動で 20 件まで
 * - 大きさは DB の上限（`LIMITS`）に切り詰め、URL・トークンらしきものは伏せる。場所はパスと `?view=` だけ
 * - 送れなかったら捨てる（再送しない）。失敗が続くときに送り続けないよう、失敗したら 5 分は送らない
 * - どこから呼んでも例外を投げない
 */
import { getSupabase, isSupabaseConfigured } from './supabase'
import { isNetworkErrorMessage } from './errorMessages'

export type ErrorKind = 'render' | 'error' | 'unhandledrejection' | 'sync' | 'chunk'

/** `client_errors_size_check` と同じ上限（文字数。`extra` は JSON のバイト数） */
export const LIMITS = { message: 2000, stack: 8000, url: 500, appVersion: 100, userAgent: 500, extra: 4000 } as const

/** 1 回の起動で送る数の上限 */
export const MAX_REPORTS_PER_SESSION = 20
/** 同じエラーを送り直すまでの間 */
export const SAME_ERROR_INTERVAL_MS = 10 * 60_000
/** 送信に失敗したら、この間は送らない */
export const PAUSE_AFTER_FAILURE_MS = 5 * 60_000
/** 送っている途中・待っている送信の上限。超えた分は捨てる */
const MAX_QUEUED = 5

let userId: string | null = null
let sentCount = 0
let pausedUntil = 0
let queued = 0
let chain: Promise<void> = Promise.resolve()
const lastSent = new Map<string, number>()

/** ログイン中の人（null = ログアウト）。ログインしていなければ送らない */
export function setErrorReportUser(id: string | null): void {
  userId = id
}

/** テスト用: 起動直後の状態に戻す */
export function resetErrorReportForTests(): void {
  userId = null
  sentCount = 0
  pausedUntil = 0
  queued = 0
  chain = Promise.resolve()
  lastSent.clear()
}

/** 送信がすべて終わるまで待つ（テスト用） */
export function flushErrorReports(): Promise<void> {
  return chain
}

/** トークン・メールアドレス・JWT らしきものを伏せる */
export function redact(text: string): string {
  return text
    .replace(
      /\b(access_token|refresh_token|provider_token|provider_refresh_token|id_token|token|code|state|apikey|key)=([^&#\s"']+)/gi,
      '$1=[redacted]',
    )
    .replace(/\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g, '[jwt]')
    .replace(/\bBearer\s+[\w.~+/-]+=*/gi, 'Bearer [redacted]')
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]')
}

/** 長さを上限に切る（切ったら末尾に … ） */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  let end = max - 1
  // 絵文字などのサロゲートペアを半分で切らない
  const last = text.charCodeAt(end - 1)
  if (last >= 0xd800 && last <= 0xdbff) end--
  return `${text.slice(0, end)}…`
}

/** 今の場所。パスと `?view=` だけ（ログインの `#access_token`・Google の `?code=` などは送らない） */
export function pageLocation(href: string): string {
  try {
    const url = new URL(href)
    const view = url.searchParams.get('view')
    return view ? `${url.pathname}?view=${encodeURIComponent(view)}` : url.pathname
  } catch {
    return ''
  }
}

/** スタックのうち、メッセージの行を除いた最初の行（同じエラーかどうかの目印） */
export function topFrame(stack: string | undefined): string {
  if (!stack) return ''
  const lines = stack.split('\n').map((l) => l.trim())
  return lines.find((l) => /^at\s|@/.test(l)) ?? ''
}

function describe(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    const name = error.name && error.name !== 'Error' ? `${error.name}: ` : ''
    return { message: `${name}${error.message}`, stack: error.stack }
  }
  if (typeof error === 'string') return { message: error }
  try {
    return { message: JSON.stringify(error) ?? String(error) }
  } catch {
    return { message: String(error) }
  }
}

function extraJson(extra: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!extra) return null
  try {
    const json = redact(JSON.stringify(extra))
    // DB は jsonb を空白入りの文字列にして数えるので、余裕を持たせる
    if (new TextEncoder().encode(json).length <= LIMITS.extra * 0.75) return JSON.parse(json) as Record<string, unknown>
    // 大きすぎるときは文字列にして切る（バイト数で収まるよう、文字数は上限の 1/4 に）
    return { truncated: truncate(json, Math.floor(LIMITS.extra / 4)) }
  } catch {
    return null
  }
}

function appVersion(): string | null {
  const v = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? null
  return v ? truncate(v, LIMITS.appVersion) : null
}

/** 送る行（DB の列名）。送らないなら null */
export function buildReport(kind: ErrorKind, error: unknown, extra?: Record<string, unknown>) {
  const { message, stack } = describe(error)
  return {
    kind,
    message: truncate(redact(message), LIMITS.message),
    stack: stack ? truncate(redact(stack), LIMITS.stack) : null,
    url: typeof location !== 'undefined' ? truncate(pageLocation(location.href), LIMITS.url) : null,
    app_version: appVersion(),
    user_agent: typeof navigator !== 'undefined' && navigator.userAgent ? truncate(navigator.userAgent, LIMITS.userAgent) : null,
    extra: extraJson(extra),
  }
}

/** エラーを送る（送れなくても何もしない）。送るかどうかはここで決める */
export function reportError(kind: ErrorKind, error: unknown, extra?: Record<string, unknown>): void {
  try {
    if (!userId || !isSupabaseConfigured) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    const now = Date.now()
    if (now < pausedUntil || sentCount >= MAX_REPORTS_PER_SESSION || queued >= MAX_QUEUED) return
    const { message, stack } = describe(error)
    const key = `${kind}|${message}|${topFrame(stack)}`
    const last = lastSent.get(key)
    if (last !== undefined && now - last < SAME_ERROR_INTERVAL_MS) return
    const sb = getSupabase()
    if (!sb) return
    const row = buildReport(kind, error, extra)
    lastSent.set(key, now)
    sentCount++
    queued++
    chain = chain.then(async () => {
      try {
        const { error: insertError } = await sb.from('client_errors').insert(row)
        if (insertError) pausedUntil = Date.now() + PAUSE_AFTER_FAILURE_MS
      } catch {
        pausedUntil = Date.now() + PAUSE_AFTER_FAILURE_MS
      } finally {
        queued--
      }
    })
  } catch {
    // 報告の失敗で画面や同期を止めない
  }
}

/**
 * 同期の失敗を送る。回線の失敗（オフライン・fetch の失敗）は送らない（直ればそのまま送れるので）
 * `stage` は どこで失敗したか（pull / push / rejected / stale / settings:labels など）
 */
export function reportSyncError(stage: string, error: unknown, extra?: Record<string, unknown>): void {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
    if (isNetworkErrorMessage(message)) return
    reportError('sync', typeof error === 'string' ? `${stage}: ${error}` : error, { stage, ...extra })
  } catch {
    // 同上
  }
}

/** 拾われなかったエラーのうち、送っても役に立たないもの */
function isNoise(message: string): boolean {
  // 別オリジンのスクリプトのエラー（中身が無い）・ResizeObserver の無害な警告
  return message === 'Script error.' || message === '' || /ResizeObserver loop/i.test(message)
}

const INSTALLED = Symbol.for('chronograma.errorReportInstalled')

/** window の error / unhandledrejection を送る。何度呼んでも 1 回だけ付ける（HMR で main を読み直しても重ねない） */
export function installGlobalErrorReporting(): void {
  if (typeof window === 'undefined') return
  const w = window as unknown as Record<symbol, boolean>
  if (w[INSTALLED]) return
  w[INSTALLED] = true
  window.addEventListener('error', (event) => {
    const message = event.error instanceof Error ? event.error.message : (event.message ?? '')
    if (isNoise(message)) return
    reportError('error', event.error ?? message, {
      source: event.filename ? pageLocation(event.filename) : undefined,
      line: event.lineno || undefined,
      col: event.colno || undefined,
    })
  })
  window.addEventListener('unhandledrejection', (event) => {
    const reason: unknown = event.reason
    const message = reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : ''
    // 回線の失敗は送らない（オフラインで fetch したときなど）
    if (isNetworkErrorMessage(message)) return
    if (reason instanceof Error && isNoise(message)) return
    reportError('unhandledrejection', reason ?? 'unknown rejection')
  })
}
