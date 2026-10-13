/**
 * 端末で起きたエラーを Supabase の表 `client_errors`（`011_client_errors.sql`）に送る。外部のサービスは使わない。
 * - 送るのはログイン中で Supabase の設定があるときだけ（`setErrorReportUser` は AuthProvider が呼ぶ）。
 *   ログインしていない間の失敗は端末に新しい 10 件までためておき（中身は送るときと同じく伏せた形）、ログインしたら送る
 * - 同じエラー（種類・メッセージ・スタックの先頭の行）は 10 分に 1 回まで、1 時間に 20 件まで
 *   （ホーム画面のアプリは何日も開いたままなので、起動ごとに数えると最初の 20 件のあとが残らない）
 * - 大きさは DB の上限（`LIMITS`）に切り詰め、URL・トークンらしきものは伏せる。場所はパスと `?view=` だけ
 * - 送れなかったら捨てる（再送しない）。失敗が続くときに送り続けないよう、失敗したら 5 分は送らない
 * - どこから呼んでも例外を投げない
 */
import { getSupabase, isSupabaseConfigured } from './supabase'
import { isNetworkErrorMessage } from './errorMessages'

/** `client_errors_kind_check`（`011`・`020`）と同じ。`storage` / `integration` / `push` は `reportFailure` から */
export type ErrorKind = 'render' | 'error' | 'unhandledrejection' | 'sync' | 'chunk' | 'storage' | 'integration' | 'push'

/** `client_errors_size_check` と同じ上限（文字数。`extra` は JSON のバイト数） */
export const LIMITS = { message: 2000, stack: 8000, url: 500, appVersion: 100, userAgent: 500, extra: 4000 } as const

/** 1 時間（`REPORT_WINDOW_MS`）に送る数の上限 */
export const MAX_REPORTS_PER_HOUR = 20
export const REPORT_WINDOW_MS = 60 * 60_000
/** ログインしていない間にためておく数（新しいものから） */
export const MAX_PENDING_REPORTS = 10
/** ためておく場所（localStorage） */
export const PENDING_REPORTS_KEY = 'chronograma-pending-errors-v1'
/** 同じエラーを送り直すまでの間 */
export const SAME_ERROR_INTERVAL_MS = 10 * 60_000
/** 送信に失敗したら、この間は送らない */
export const PAUSE_AFTER_FAILURE_MS = 5 * 60_000
/** 送っている途中・待っている送信の上限。超えた分は捨てる */
const MAX_QUEUED = 5

let userId: string | null = null
let sentCount = 0
let windowStart = 0
let pausedUntil = 0
let queued = 0
let chain: Promise<void> = Promise.resolve()
const lastSent = new Map<string, number>()
type ReportRow = ReturnType<typeof buildReport>
/** ログインしていない間の失敗（null = まだ localStorage から読んでいない） */
let pending: ReportRow[] | null = null

/** ログイン中の人（null = ログアウト）。ログインしていなければ送らない（ためておき、ログインしたら送る） */
export function setErrorReportUser(id: string | null): void {
  userId = id
  if (id) sendPending()
}

/** テスト用: 起動直後の状態に戻す */
export function resetErrorReportForTests(): void {
  userId = null
  sentCount = 0
  windowStart = 0
  pausedUntil = 0
  pending = null
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
    if (!isSupabaseConfigured) return
    const now = Date.now()
    const { message, stack } = describe(error)
    const key = `${kind}|${message}|${topFrame(stack)}`
    const last = lastSent.get(key)
    if (last !== undefined && now - last < SAME_ERROR_INTERVAL_MS) return
    // ログインしていない・オフラインの間はためておき、ログインしたとき・回線が戻ったときに送る
    if (!userId || isOffline()) {
      lastSent.set(key, now)
      keepPending(buildReport(kind, error, extra), now)
      return
    }
    if (now < pausedUntil || queued >= MAX_QUEUED) return
    const sb = getSupabase()
    if (!sb || !takeBudget(1, now)) return
    lastSent.set(key, now)
    send(sb, buildReport(kind, error, extra))
  } catch {
    // 報告の失敗で画面や同期を止めない
  }
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

/** 1 時間の枠に n 件の空きがあれば数えて true（枠が過ぎていたら数え直す） */
function takeBudget(n: number, now: number): boolean {
  if (now - windowStart >= REPORT_WINDOW_MS) {
    windowStart = now
    sentCount = 0
  }
  if (sentCount + n > MAX_REPORTS_PER_HOUR) return false
  sentCount += n
  return true
}

function send(sb: NonNullable<ReturnType<typeof getSupabase>>, rows: ReportRow | ReportRow[]): void {
  queued++
  chain = chain.then(async () => {
    try {
      const { error: insertError } = await sb.from('client_errors').insert(rows)
      if (insertError) pausedUntil = Date.now() + PAUSE_AFTER_FAILURE_MS
    } catch {
      pausedUntil = Date.now() + PAUSE_AFTER_FAILURE_MS
    } finally {
      queued--
    }
  })
}

function loadPending(): ReportRow[] {
  if (pending) return pending
  pending = []
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(PENDING_REPORTS_KEY) : null
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (Array.isArray(parsed)) pending = (parsed as ReportRow[]).slice(-MAX_PENDING_REPORTS)
  } catch {
    // 読めなければ無いものとして扱う
  }
  return pending
}

function savePending(rows: ReportRow[]): void {
  try {
    if (typeof localStorage === 'undefined') return
    if (rows.length === 0) localStorage.removeItem(PENDING_REPORTS_KEY)
    else localStorage.setItem(PENDING_REPORTS_KEY, JSON.stringify(rows))
  } catch {
    // 容量不足でも、この起動の間は手元に持っておく
  }
}

/** ログインしていない間の 1 件をためる。起きた時刻は `extra.occurred_at`（`created_at` は送った時刻になる） */
function keepPending(row: ReportRow, now: number): void {
  const rows = [...loadPending(), { ...row, extra: { ...row.extra, occurred_at: new Date(now).toISOString() } }]
  pending = rows.slice(-MAX_PENDING_REPORTS)
  savePending(pending)
}

/** ためておいた失敗をまとめて 1 回で送る（1 時間の上限に数える。入りきらない古い分は捨てる） */
function sendPending(): void {
  try {
    if (!userId || !isSupabaseConfigured || isOffline()) return
    const rows = loadPending()
    if (rows.length === 0) return
    const now = Date.now()
    if (now < pausedUntil || queued >= MAX_QUEUED) return
    takeBudget(0, now)
    const toSend = rows.slice(-Math.max(0, MAX_REPORTS_PER_HOUR - sentCount))
    const sb = getSupabase()
    if (!sb || toSend.length === 0 || !takeBudget(toSend.length, now)) return
    pending = []
    savePending(pending)
    send(sb, toSend)
  } catch {
    // 同上
  }
}

/**
 * 黙って続けていた失敗（端末の保存・連携の取り込み・通知の購読）を送る。回線の失敗は送らない（直ればそのまま動くので）。
 * `stage` は どこで失敗したか（save / load / auto-backup / canvas / notion:advance / subscribe など）。
 * 利用者の中身（タイトル・メモ・URL）は渡さない（段階・表や項目の名前・数・エラーのメッセージだけ）
 */
export function reportFailure(
  kind: 'storage' | 'integration' | 'push',
  stage: string,
  error: unknown,
  extra?: Record<string, unknown>,
): void {
  try {
    const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
    if (isNetworkErrorMessage(message)) return
    reportError(kind, typeof error === 'string' ? `${stage}: ${error}` : error, { stage, ...extra })
  } catch {
    // 同上
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
  // オフラインの間にためた失敗を、回線が戻ったら送る
  window.addEventListener('online', () => sendPending())
  window.addEventListener('unhandledrejection', (event) => {
    const reason: unknown = event.reason
    const message = reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : ''
    // 回線の失敗は送らない（オフラインで fetch したときなど）
    if (isNetworkErrorMessage(message)) return
    if (reason instanceof Error && isNoise(message)) return
    reportError('unhandledrejection', reason ?? 'unknown rejection')
  })
}
