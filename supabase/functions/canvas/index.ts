import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

/**
 * Canvas LMS 連携。Planner（To Do）の課題を返し、タスクを完了にしたら Canvas の To Do も完了にする。
 * アクセストークン（最長 90 日）は canvas_connection に置き、ブラウザには返さない。
 */

/** タスクにする種類。お知らせ・カレンダーの予定は「やること」ではないので外す */
const PLANNABLE_TYPES = new Set(['assignment', 'quiz', 'discussion_topic', 'wiki_page', 'planner_note'])
/** 取り込む範囲。出し忘れた課題を拾うため少し過去から、学期の残りまで */
const WINDOW_PAST_DAYS = 30
const WINDOW_FUTURE_DAYS = 120

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

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
class CanvasError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code)
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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

async function canvasRequest(baseUrl: string, token: string, url: string, init: RequestInit = {}): Promise<Response> {
  // ページ送りの URL も含め、つないだ Canvas 以外にはトークンを送らない
  if (!url.startsWith(`${baseUrl}/`)) throw new CanvasError('canvas_api', 'Unexpected host')
  let res: Response
  try {
    res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      redirect: 'manual',
    })
  } catch (e) {
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
    out.push(...((await res.json()) as T[]))
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

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

    const loadRow = async () => {
      const { data, error } = await admin
        .from('canvas_connection')
        .select('base_url, token, user_name')
        .eq('user_id', user.id)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data as { base_url: string; token: string; user_name: string | null } | null
    }

    if (action === 'connect') {
      const token = (body.token as string | undefined)?.trim()
      // トークンだけ貼り直すときは、つないであった URL を使う
      const prev = body.baseUrl ? null : await loadRow()
      const baseUrl = prev?.base_url ?? parseBaseUrl((body.baseUrl as string | undefined) ?? '')
      if (!baseUrl) return jsonResponse({ ok: false, code: 'canvas_bad_url' })
      if (!token) return jsonResponse({ ok: false, code: 'canvas_unauthorized' })
      const self = await canvasJson<{ name?: string }>(baseUrl, token, '/api/v1/users/self')
      const userName = self.name ?? null
      const { error } = await admin.from('canvas_connection').upsert(
        { user_id: user.id, base_url: baseUrl, token, user_name: userName, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      )
      if (error) throw new Error(error.message)
      return jsonResponse({ ok: true, connected: true, baseUrl, userName })
    }

    if (action === 'disconnect') {
      const { error } = await admin.from('canvas_connection').delete().eq('user_id', user.id)
      if (error) return jsonResponse({ ok: false, error: error.message }, 500)
      return jsonResponse({ ok: true })
    }

    const row = await loadRow()
    if (!row) return jsonResponse({ ok: true, connected: false })

    if (action === 'status') {
      // トークンの期限切れは同期のエラーで分かるので、ここでは Canvas を呼ばない
      return jsonResponse({ ok: true, connected: true, baseUrl: row.base_url, userName: row.user_name })
    }

    if (action === 'items') {
      return jsonResponse({ ok: true, connected: true, ...(await plannerItems(row.base_url, row.token)) })
    }

    if (action === 'complete') {
      const type = body.type as string | undefined
      const id = String(body.id ?? '')
      if (!type || !PLANNABLE_TYPES.has(type) || !/^\d+$/.test(id) || typeof body.complete !== 'boolean') {
        return jsonResponse({ ok: false, error: 'type, id and complete are required' }, 400)
      }
      await setMarkedComplete(row.base_url, row.token, type, id, body.complete)
      return jsonResponse({ ok: true })
    }

    return jsonResponse({ error: 'Unknown action' }, 400)
  } catch (e) {
    if (e instanceof CanvasError) {
      return jsonResponse({ ok: false, code: e.code, error: e.message })
    }
    const message = e instanceof Error ? e.message : String(e)
    return jsonResponse({ ok: false, error: message })
  }
})
