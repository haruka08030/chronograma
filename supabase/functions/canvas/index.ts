import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { parseCanvasFeed } from './ical.ts'
import { withCors } from '../_shared/cors.ts'

/**
 * Canvas LMS 連携。Planner（To Do）の課題を返し、タスクを完了にしたら Canvas の To Do も完了にする。
 * 学校（ホスト名）ごとに 1 つつなげる。アクセストークン（最長 90 日）は canvas_connection に置き、ブラウザには返さない。
 * トークンを作れない学校は、カレンダーフィード（.ics）の URL でつなぐ（kind = 'ical'。読むだけで、完了は書き戻せない）。
 */

/** タスクにする種類。お知らせ・カレンダーの予定は「やること」ではないので外す */
const PLANNABLE_TYPES = new Set(['assignment', 'quiz', 'discussion_topic', 'wiki_page', 'planner_note'])
/** 取り込む範囲。出し忘れた課題を拾うため少し過去から、学期の残りまで */
const WINDOW_PAST_DAYS = 30
const WINDOW_FUTURE_DAYS = 120
/** トークンの期限がこれより近ければ延ばす。延ばす先は学校の上限（多くは 90 日）の内側にする */
const EXTEND_WHEN_DAYS_LEFT = 60
const EXTEND_TO_DAYS = 89
/** 期限を確かめる間隔 */
const CHECK_EVERY_MS = 20 * 3_600_000

type PlannerItem = {
  plannable_type: string
  plannable_id: number | string
  plannable_date?: string | null
  plannable?: { title?: string; due_at?: string | null; todo_date?: string | null }
  course_id?: number | null
  context_name?: string | null
  html_url?: string | null
  submissions?: false | { submitted?: boolean; excused?: boolean; graded?: boolean }
  planner_override?: { id: number; marked_complete?: boolean } | null
}

type PlannerOverride = { id: number; plannable_type: string; plannable_id: number | string }

/** クライアントに分かる形のエラー。文言はクライアント側で訳す */
const MAX_CONNECTIONS = 5

class CanvasError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code)
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * 学校の Canvas の URL（`xxx.instructure.com` やダッシュボードのリンク）から origin を取り出す。
 * サーバーから任意の宛先へトークンを送らないよう、https のドメイン名だけを受け付ける。
 */
function parseBaseUrl(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase()
  if (url.protocol !== 'https:' || url.port || !host.includes('.')) return null
  if (/^[\d.]+$/.test(host) || host.startsWith('[') || host === 'localhost' || host.endsWith('.local')) return null
  return `https://${host}`
}

/** IPv4 / IPv6 の内部・ループバック・リンクローカルのアドレスか */
function isPrivateAddress(ip: string): boolean {
  const v4 = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224
  }
  const v6 = ip.toLowerCase()
  if (v6.startsWith('::ffff:')) return isPrivateAddress(v6.slice(7))
  return v6 === '::' || v6 === '::1' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6)
}

const checkedHosts = new Map<string, boolean>()

/**
 * 名前が内部のアドレスを指していないか確かめる（ドメイン名で内部のサーバーへ届かせないため）。
 * 名前解決そのものに失敗したときは fetch に任せる（それも失敗して canvas_bad_url になる）
 */
async function assertPublicHost(host: string): Promise<void> {
  let ok = checkedHosts.get(host)
  // 実行環境に名前解決の API が無ければ、ドメイン名の検査（parseBaseUrl）とリダイレクトの検査だけに頼る
  if (ok === undefined && typeof Deno.resolveDns !== 'function') ok = true
  if (ok === undefined) {
    const lookups = await Promise.all(
      (['A', 'AAAA'] as const).map((type) => Deno.resolveDns(host, type).catch(() => [] as string[])),
    )
    ok = !lookups.flat().some(isPrivateAddress)
    checkedHosts.set(host, ok)
  }
  if (!ok) throw new CanvasError('canvas_bad_url', 'Private address')
}

/** カレンダーフィードの URL（`https://<学校>/feeds/calendars/user_….ics`）。それ以外の宛先は読まない */
function parseFeedUrl(input: string): { baseUrl: string; feedUrl: string } | null {
  const baseUrl = parseBaseUrl(input)
  if (!baseUrl) return null
  let path: string
  try {
    path = new URL(input.trim()).pathname
  } catch {
    return null
  }
  if (!/^\/feeds\/calendars\/[\w.-]+\.ics$/.test(path)) return null
  return { baseUrl, feedUrl: `${baseUrl}${path}` }
}

/** フィードを読む。締切が昨日〜120 日後の課題だけ（済んだか分からない過去の課題は取り込まない） */
async function feedItems(baseUrl: string, feedUrl: string) {
  let res: Response
  let url = feedUrl
  try {
    // リダイレクトは自動で追わない。追うと、学校の URL のふりをしたサイトから内部の宛先へ飛ばされる。
    // 学校が別ドメインへ移した場合に備え、行き先も https の公開ドメインなら数回まで追う
    for (let hop = 0; ; hop++) {
      await assertPublicHost(new URL(url).hostname)
      res = await fetch(url, { headers: { Accept: 'text/calendar' }, redirect: 'manual' })
      if (res.status < 300 || res.status >= 400) break
      const next = res.headers.get('location')
      const nextBase = next ? parseBaseUrl(new URL(next, url).href) : null
      if (!next || !nextBase || hop >= 3) throw new CanvasError('canvas_feed_invalid', `HTTP ${res.status}`)
      url = new URL(next, url).href
    }
  } catch (e) {
    if (e instanceof CanvasError) throw e
    throw new CanvasError('canvas_bad_url', e instanceof Error ? e.message : String(e))
  }
  const text = res.ok ? await res.text() : ''
  // URL を作り直すと古い URL は 404 になる
  if (!text.includes('BEGIN:VCALENDAR')) throw new CanvasError('canvas_feed_invalid', `HTTP ${res.status}`)
  const now = Date.now()
  const windowStart = ymd(new Date(now - 86_400_000))
  const windowEnd = ymd(new Date(now + WINDOW_FUTURE_DAYS * 86_400_000))
  return { windowStart, windowEnd, readOnly: true, items: parseCanvasFeed(text, baseUrl, windowStart, windowEnd) }
}

async function canvasRequest(baseUrl: string, token: string, url: string, init: RequestInit = {}): Promise<Response> {
  // ページ送りの URL も含め、つないだ Canvas 以外にはトークンを送らない
  if (!url.startsWith(`${baseUrl}/`)) throw new CanvasError('canvas_api', 'Unexpected host')
  let res: Response
  try {
    await assertPublicHost(new URL(baseUrl).hostname)
    res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      redirect: 'manual',
    })
  } catch (e) {
    if (e instanceof CanvasError) throw e
    throw new CanvasError('canvas_bad_url', e instanceof Error ? e.message : String(e))
  }
  if (res.ok) return res
  const text = await res.text().catch(() => '')
  if (res.status === 401) throw new CanvasError('canvas_unauthorized', text.slice(0, 200))
  if (res.status === 403 && /rate limit/i.test(text)) throw new CanvasError('canvas_rate_limited')
  // 学校のログイン画面へのリダイレクトや、Canvas でないサイト
  if (res.status === 404 || (res.status >= 300 && res.status < 400)) throw new CanvasError('canvas_bad_url', `HTTP ${res.status}`)
  throw new CanvasError('canvas_api', `Canvas API ${res.status}: ${text.slice(0, 200)}`)
}

async function canvasJson<T>(baseUrl: string, token: string, path: string, init: RequestInit = {}) {
  const res = await canvasRequest(baseUrl, token, `${baseUrl}${path}`, init)
  try {
    return (await res.json()) as T
  } catch {
    throw new CanvasError('canvas_bad_url', 'Not JSON')
  }
}

function nextLink(res: Response): string | null {
  const link = res.headers.get('Link') ?? ''
  for (const part of link.split(',')) {
    const m = /<([^>]+)>\s*;\s*rel="next"/.exec(part)
    if (m) return m[1]
  }
  return null
}

/** ページ送りしながら全件取る。途中までの結果で「消えた課題」を完了にしないよう、取り切れなければ失敗にする */
async function canvasAll<T>(baseUrl: string, token: string, path: string): Promise<T[]> {
  const out: T[] = []
  let url: string | null = `${baseUrl}${path}`
  for (let i = 0; i < 20 && url; i++) {
    const res = await canvasRequest(baseUrl, token, url)
    const page = await res.json().catch(() => null)
    // ログイン画面などの HTML が返ってきたときは、URL が Canvas の API ではない
    if (!Array.isArray(page)) throw new CanvasError('canvas_bad_url', 'Not a JSON array')
    out.push(...(page as T[]))
    url = nextLink(res)
  }
  if (url) throw new CanvasError('canvas_api', 'Too many items')
  return out
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10)
}

function isDone(item: PlannerItem): boolean {
  const s = item.submissions
  return Boolean(item.planner_override?.marked_complete || (s && (s.submitted || s.excused || s.graded)))
}

async function plannerItems(baseUrl: string, token: string) {
  const now = Date.now()
  const windowStart = ymd(new Date(now - WINDOW_PAST_DAYS * 86_400_000))
  const windowEnd = ymd(new Date(now + WINDOW_FUTURE_DAYS * 86_400_000))
  const raw = await canvasAll<PlannerItem>(
    baseUrl,
    token,
    `/api/v1/planner/items?start_date=${windowStart}&end_date=${windowEnd}&per_page=100`,
  )
  const items = raw
    .filter((i) => PLANNABLE_TYPES.has(i.plannable_type))
    .map((i) => ({
      type: i.plannable_type,
      id: String(i.plannable_id),
      title: (i.plannable?.title ?? '').trim(),
      courseId: i.course_id != null ? String(i.course_id) : null,
      courseName: i.course_id != null ? i.context_name ?? null : null,
      url: i.html_url ? new URL(i.html_url, baseUrl).toString() : baseUrl,
      dueAt: i.plannable?.due_at ?? i.plannable?.todo_date ?? i.plannable_date ?? null,
      done: isDone(i),
    }))
  return { windowStart, windowEnd, items }
}

/** Canvas の To Do の「完了」を付け外しする。既に上書きがあれば更新、無ければ作る */
type UserToken = { id: number; token_hint?: string | null; expires_at?: string | null }

/**
 * いま使っているトークンの期限を確かめ、近ければ延ばす（Canvas は期限を書き換えられ、トークンの文字列は変わらない）。
 * 自分で作ったトークンの一覧から、先頭の数文字（token_hint）が一致するものを探す。
 * 見つからない・学校の設定で延ばせないときは、分かった期限だけ返す（期限切れになれば貼り直しの欄が出る）。
 */
async function checkTokenExpiry(baseUrl: string, token: string): Promise<string | null> {
  const tokens = await canvasAll<UserToken>(baseUrl, token, '/api/v1/users/self/user_generated_tokens?per_page=100')
  const mine = tokens.filter((t) => t.token_hint && token.startsWith(t.token_hint))
  if (mine.length !== 1) return null
  const current = mine[0]
  if (!current.expires_at) return null
  const left = Date.parse(current.expires_at) - Date.now()
  if (left > EXTEND_WHEN_DAYS_LEFT * 86_400_000) return current.expires_at
  try {
    const updated = await canvasJson<UserToken>(baseUrl, token, `/api/v1/users/self/tokens/${current.id}`, {
      method: 'PUT',
      body: JSON.stringify({ token: { expires_at: new Date(Date.now() + EXTEND_TO_DAYS * 86_400_000).toISOString() } }),
    })
    return updated.expires_at ?? current.expires_at
  } catch (e) {
    console.warn('[canvas] could not extend token', e instanceof Error ? e.message : e)
    return current.expires_at
  }
}

async function setMarkedComplete(baseUrl: string, token: string, type: string, id: string, complete: boolean) {
  const overrides = await canvasAll<PlannerOverride>(baseUrl, token, '/api/v1/planner/overrides?per_page=100')
  const existing = overrides.find((o) => o.plannable_type === type && String(o.plannable_id) === id)
  if (existing) {
    await canvasJson(baseUrl, token, `/api/v1/planner/overrides/${existing.id}`, {
      method: 'PUT',
      body: JSON.stringify({ marked_complete: complete }),
    })
    return
  }
  if (!complete) return
  await canvasJson(baseUrl, token, '/api/v1/planner/overrides', {
    method: 'POST',
    body: JSON.stringify({ plannable_type: type, plannable_id: Number(id), marked_complete: true }),
  })
}

Deno.serve(withCors(async (req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return jsonResponse({ error: 'Server misconfigured' }, 500)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header' }, 401)
    }
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()
    if (userError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const admin = createClient(supabaseUrl, serviceRoleKey)
    const body = req.method === 'POST' ? await req.json() : {}
    const action = (body.action as string) ?? ''
    const connectionId = typeof body.connectionId === 'string' ? body.connectionId : null

    type Row = {
      id: string
      base_url: string
      kind: 'token' | 'ical'
      token: string | null
      feed_url: string | null
      user_name: string | null
      token_expires_at: string | null
      token_checked_at: string | null
    }
    const loadRows = async (): Promise<Row[]> => {
      const { data, error } = await admin
        .from('canvas_connection')
        .select('id, base_url, kind, token, feed_url, user_name, token_expires_at, token_checked_at')
        .eq('user_id', user.id)
        .order('updated_at')
      if (error) throw new Error(error.message)
      return (data ?? []) as Row[]
    }
    /** 設定画面に返す形。トークンは含めない */
    const describe = (rows: Row[]) => ({
      ok: true,
      connections: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        baseUrl: r.base_url,
        userName: r.user_name,
        expiresAt: r.kind === 'token' ? r.token_expires_at : null,
      })),
    })

    /** 期限の確認と延長。失敗しても同期は止めない */
    const refreshExpiry = async (r: { id: string; base_url: string; token: string }) => {
      try {
        const expiresAt = await checkTokenExpiry(r.base_url, r.token)
        await admin
          .from('canvas_connection')
          .update({ token_expires_at: expiresAt, token_checked_at: new Date().toISOString() })
          .eq('user_id', user.id)
          .eq('id', r.id)
      } catch (e) {
        console.warn('[canvas] token check failed', e instanceof Error ? e.message : e)
      }
    }

    /** 1 人がつなげる学校の数（行が増え続けて、同期のたびに外へ取りに行く先が増えないように） */
    const assertRoomFor = async (host: string) => {
      const rows = await loadRows()
      if (rows.length >= MAX_CONNECTIONS && !rows.some((r) => r.id === host)) throw new CanvasError('canvas_too_many')
    }

    if (action === 'connect' && typeof body.feedUrl === 'string') {
      const feed = parseFeedUrl(body.feedUrl)
      if (!feed) return jsonResponse({ ok: false, code: 'canvas_feed_invalid' })
      await assertRoomFor(new URL(feed.baseUrl).host)
      // 読めるか確かめてから保存する
      await feedItems(feed.baseUrl, feed.feedUrl)
      const { error } = await admin.from('canvas_connection').upsert(
        {
          user_id: user.id,
          id: new URL(feed.baseUrl).host,
          base_url: feed.baseUrl,
          kind: 'ical',
          token: null,
          feed_url: feed.feedUrl,
          user_name: null,
          token_expires_at: null,
          token_checked_at: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,id' },
      )
      if (error) throw new Error(error.message)
      return jsonResponse(describe(await loadRows()))
    }

    if (action === 'connect') {
      const token = (body.token as string | undefined)?.trim()
      // connectionId があれば、その学校のトークンだけ貼り直す
      const prev = connectionId ? (await loadRows()).find((r) => r.id === connectionId) : null
      if (connectionId && !prev) return jsonResponse({ ok: false, code: 'canvas_bad_url' })
      const baseUrl = prev?.base_url ?? parseBaseUrl((body.baseUrl as string | undefined) ?? '')
      if (!baseUrl) return jsonResponse({ ok: false, code: 'canvas_bad_url' })
      if (!token) return jsonResponse({ ok: false, code: 'canvas_unauthorized' })
      await assertRoomFor(new URL(baseUrl).host)
      const self = await canvasJson<{ name?: string }>(baseUrl, token, '/api/v1/users/self')
      const { error } = await admin.from('canvas_connection').upsert(
        {
          user_id: user.id,
          id: new URL(baseUrl).host,
          base_url: baseUrl,
          kind: 'token',
          token,
          feed_url: null,
          user_name: self.name ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,id' },
      )
      if (error) throw new Error(error.message)
      // 貼ったばかりのトークンも、すぐ期限を延ばしておく
      await refreshExpiry({ id: new URL(baseUrl).host, base_url: baseUrl, token })
      return jsonResponse(describe(await loadRows()))
    }

    if (action === 'disconnect') {
      if (!connectionId) return jsonResponse({ ok: false, error: 'connectionId is required' }, 400)
      // 行を消すだけでは Canvas 側にトークンが残るので、先に取り消す（失敗しても切断は進める）
      const target = (await loadRows()).find((r) => r.id === connectionId)
      if (target?.kind === 'token' && target.token) {
        await canvasRequest(target.base_url, target.token, `${target.base_url}/login/oauth2/token`, {
          method: 'DELETE',
          signal: AbortSignal.timeout(5000),
        }).catch((e) => console.warn('[canvas] revoke failed', e instanceof Error ? e.message : e))
      }
      const { error } = await admin.from('canvas_connection').delete().eq('user_id', user.id).eq('id', connectionId)
      if (error) {
        console.error('[canvas] disconnect', error.message)
        return jsonResponse({ ok: false, code: 'canvas_api', error: 'canvas_api' }, 500)
      }
      return jsonResponse(describe(await loadRows()))
    }

    const rows = await loadRows()

    if (action === 'status') {
      // トークンの期限切れは同期のエラーで分かるので、ここでは Canvas を呼ばない
      return jsonResponse(describe(rows))
    }

    if (action === 'items') {
      // 1 校のトークンが切れていても、ほかの学校は取り込む
      const connections = await Promise.all(
        rows.map(async (r) => {
          try {
            if (r.kind === 'ical') return { id: r.id, ...(await feedItems(r.base_url, r.feed_url ?? '')) }
            const token = r.token ?? ''
            const result = { id: r.id, ...(await plannerItems(r.base_url, token)) }
            if (!r.token_checked_at || Date.now() - Date.parse(r.token_checked_at) > CHECK_EVERY_MS) {
              await refreshExpiry({ id: r.id, base_url: r.base_url, token })
            }
            return result
          } catch (e) {
            // 想定外の失敗（Canvas が JSON でない応答を返したなど）でも、その学校だけのエラーにして、ほかの学校は取り込む
            if (e instanceof CanvasError) return { id: r.id, error: e.code }
            console.error('[canvas] items', r.id, e instanceof Error ? e.message : e)
            return { id: r.id, error: 'canvas_api' }
          }
        }),
      )
      return jsonResponse({ ok: true, connections })
    }

    if (action === 'complete') {
      const row = rows.find((r) => r.id === connectionId)
      const type = body.type as string | undefined
      const id = String(body.id ?? '')
      if (!row || !type || !PLANNABLE_TYPES.has(type) || !/^\d+$/.test(id) || typeof body.complete !== 'boolean') {
        return jsonResponse({ ok: false, error: 'connectionId, type, id and complete are required' }, 400)
      }
      // フィードでつないだ学校は読むだけなので、完了は Canvas に書き戻さない
      if (row.kind === 'token' && row.token) await setMarkedComplete(row.base_url, row.token, type, id, body.complete)
      return jsonResponse({ ok: true })
    }

    return jsonResponse({ error: 'Unknown action' }, 400)
  } catch (e) {
    // 学校のサイトや DB の応答の中身は返さない（ログにだけ残す）
    console.error('[canvas]', e instanceof Error ? e.message : e)
    if (e instanceof CanvasError) return jsonResponse({ ok: false, code: e.code, error: e.code })
    return jsonResponse({ ok: false, code: 'canvas_api', error: 'canvas_api' })
  }
}))
