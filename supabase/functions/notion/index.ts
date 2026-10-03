import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { withCors } from '../_shared/cors.ts'

/**
 * Notion 連携。1 人 1 データベースを読み、「要アクション」のステータスの行をタスクとして返す。
 * タスクを完了にしたら、その行のステータスを設定した「次のステータス」へ進める。
 * 統合トークンは notion_connection に置き、ブラウザには返さない。
 */

const NOTION_API = 'https://api.notion.com/v1'
// データベースを /databases/{id}/query で読む版に固定する（2025-09 以降の data_sources 版にはしない）
const NOTION_VERSION = '2022-06-28'

type StatusKind = 'status' | 'select'

type NotionConfig = {
  statusProperty: string | null
  dateProperty: string | null
  actionStatuses: string[]
  /** 完了にしたときの進め先。キーは要アクションのステータス */
  nextStatus: Record<string, string>
}

type SchemaProperty = { name: string; type: string; options?: string[] }

type NotionProperty = {
  type: string
  title?: Array<{ plain_text: string }>
  status?: { name: string } | null
  select?: { name: string } | null
  date?: { start: string } | null
}

type NotionPage = {
  id: string
  url: string
  archived?: boolean
  in_trash?: boolean
  properties: Record<string, NotionProperty>
}

/** クライアントに分かる形のエラー。文言はクライアント側で訳す */
class NotionError extends Error {
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

async function notionFetch<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${NOTION_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
  })
  if (res.ok) return (await res.json()) as T
  const body = (await res.json().catch(() => ({}))) as { code?: string; message?: string }
  if (res.status === 401) throw new NotionError('notion_unauthorized', body.message)
  if (res.status === 404 || body.code === 'object_not_found') throw new NotionError('notion_not_shared', body.message)
  if (res.status === 429) throw new NotionError('notion_rate_limited', body.message)
  throw new NotionError('notion_api', `Notion API ${res.status}: ${body.message ?? ''}`)
}

/** データベースの URL か ID から 32 桁の ID を取り出す（`?v=` のビュー ID は無視する） */
function parseDatabaseId(input: string): string | null {
  const trimmed = input.trim()
  let path = trimmed
  try {
    path = new URL(trimmed).pathname
  } catch {
    /* ID そのものが渡された */
  }
  const match = path.replace(/-/g, '').match(/[0-9a-f]{32}/i)
  return match ? match[0].toLowerCase() : null
}

type DatabaseObject = {
  title?: Array<{ plain_text: string }>
  properties: Record<string, { type: string; status?: { options: Array<{ name: string }> }; select?: { options: Array<{ name: string }> } }>
}

function readSchema(db: DatabaseObject): { title: string; properties: SchemaProperty[] } {
  const title = (db.title ?? []).map((t) => t.plain_text).join('') || 'Notion'
  const properties = Object.entries(db.properties).map(([name, p]) => {
    const options = p.type === 'status' ? p.status?.options : p.type === 'select' ? p.select?.options : undefined
    return { name, type: p.type, ...(options ? { options: options.map((o) => o.name) } : {}) }
  })
  return { title, properties }
}

function statusKind(schema: SchemaProperty[], name: string | null): StatusKind | null {
  const prop = schema.find((p) => p.name === name)
  return prop?.type === 'status' || prop?.type === 'select' ? prop.type : null
}

/** 接続直後の既定。ステータス型を優先し、無ければ「ステータス」らしい名前のセレクト */
function defaultConfig(schema: SchemaProperty[]): NotionConfig {
  const status =
    schema.find((p) => p.type === 'status') ??
    schema.find((p) => p.type === 'select' && /ステータス|状態|status/i.test(p.name)) ??
    schema.find((p) => p.type === 'select')
  const date = schema.find((p) => p.type === 'date')
  return {
    statusProperty: status?.name ?? null,
    dateProperty: date?.name ?? null,
    actionStatuses: [],
    nextStatus: {},
  }
}

/** クライアントから来た設定を、今のスキーマに合うものだけ残して受け入れる */
function sanitizeConfig(raw: unknown, schema: SchemaProperty[]): NotionConfig {
  const c = (raw ?? {}) as Partial<NotionConfig>
  const statusProp = schema.find((p) => p.name === c.statusProperty && (p.type === 'status' || p.type === 'select'))
  const options = new Set(statusProp?.options ?? [])
  const dateProp = schema.find((p) => p.name === c.dateProperty && p.type === 'date')
  const actionStatuses = Array.isArray(c.actionStatuses)
    ? [...new Set(c.actionStatuses.filter((s): s is string => typeof s === 'string' && options.has(s)))]
    : []
  const nextStatus: Record<string, string> = {}
  for (const [from, to] of Object.entries(c.nextStatus ?? {})) {
    if (actionStatuses.includes(from) && typeof to === 'string' && options.has(to) && to !== from) {
      nextStatus[from] = to
    }
  }
  return {
    statusProperty: statusProp?.name ?? null,
    dateProperty: dateProp?.name ?? null,
    actionStatuses,
    nextStatus,
  }
}

function pageStatus(page: NotionPage, prop: string): string | null {
  const p = page.properties[prop]
  return p?.status?.name ?? p?.select?.name ?? null
}

function pageTitle(page: NotionPage): string {
  const titleProp = Object.values(page.properties).find((p) => p.type === 'title')
  return (titleProp?.title ?? []).map((t) => t.plain_text).join('').trim()
}

async function queryActionPages(token: string, databaseId: string, config: NotionConfig, kind: StatusKind) {
  const prop = config.statusProperty!
  const filter = { or: config.actionStatuses.map((s) => ({ property: prop, [kind]: { equals: s } })) }
  const pages: NotionPage[] = []
  let cursor: string | undefined
  // 就活の表なら 1〜2 回で終わる。暴走しないよう上限を置く
  for (let i = 0; i < 20; i++) {
    const res = await notionFetch<{ results: NotionPage[]; has_more: boolean; next_cursor: string | null }>(
      token,
      `/databases/${databaseId}/query`,
      { method: 'POST', body: JSON.stringify({ filter, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }) },
    )
    pages.push(...res.results)
    if (!res.has_more || !res.next_cursor) {
      return pages
        .filter((p) => !p.archived && !p.in_trash)
        .map((p) => ({
          pageId: p.id.replace(/-/g, ''),
          url: p.url,
          title: pageTitle(p),
          status: pageStatus(p, prop),
          date: config.dateProperty ? p.properties[config.dateProperty]?.date?.start ?? null : null,
        }))
        .filter((p) => p.status !== null)
    }
    cursor = res.next_cursor
  }
  // 途中までの結果で「消えた行」を完了にしてしまわないよう、全件取れなければ失敗にする
  throw new NotionError('notion_api', 'Too many pages')
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

    const loadRow = async () => {
      const { data, error } = await admin
        .from('notion_connection')
        .select('token, database_id, config')
        .eq('user_id', user.id)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data as { token: string; database_id: string; config: NotionConfig } | null
    }

    const saveRow = async (token: string, databaseId: string, config: NotionConfig) => {
      const { error } = await admin.from('notion_connection').upsert(
        { user_id: user.id, token, database_id: databaseId, config, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      )
      if (error) throw new Error(error.message)
    }

    /** 設定画面に返す形。トークンは含めない */
    const describe = async (token: string, databaseId: string, config: NotionConfig) => {
      const schema = readSchema(await notionFetch<DatabaseObject>(token, `/databases/${databaseId}`))
      return { ok: true, connected: true, databaseId, databaseTitle: schema.title, properties: schema.properties, config }
    }

    if (action === 'connect') {
      const token = (body.token as string | undefined)?.trim()
      const databaseId = parseDatabaseId((body.database as string | undefined) ?? '')
      if (!token) return jsonResponse({ ok: false, code: 'notion_unauthorized' })
      if (!databaseId) return jsonResponse({ ok: false, code: 'notion_bad_url' })
      const schema = readSchema(await notionFetch<DatabaseObject>(token, `/databases/${databaseId}`))
      // 同じデータベースにつなぎ直すときは、選んであったステータスを残す
      const prev = await loadRow()
      const config =
        prev?.database_id === databaseId ? sanitizeConfig(prev.config, schema.properties) : defaultConfig(schema.properties)
      await saveRow(token, databaseId, config)
      return jsonResponse({ ok: true, connected: true, databaseId, databaseTitle: schema.title, properties: schema.properties, config })
    }

    if (action === 'disconnect') {
      const { error } = await admin.from('notion_connection').delete().eq('user_id', user.id)
      if (error) {
        console.error('[notion] disconnect', error.message)
        return jsonResponse({ ok: false, error: 'Failed to disconnect' }, 500)
      }
      return jsonResponse({ ok: true })
    }

    const row = await loadRow()
    if (!row) return jsonResponse({ ok: true, connected: false })

    if (action === 'status') {
      return jsonResponse(await describe(row.token, row.database_id, row.config))
    }

    if (action === 'config') {
      const schema = readSchema(await notionFetch<DatabaseObject>(row.token, `/databases/${row.database_id}`))
      const config = sanitizeConfig(body.config, schema.properties)
      await saveRow(row.token, row.database_id, config)
      return jsonResponse({ ok: true, connected: true, databaseId: row.database_id, databaseTitle: schema.title, properties: schema.properties, config })
    }

    if (action === 'pages') {
      const schema = readSchema(await notionFetch<DatabaseObject>(row.token, `/databases/${row.database_id}`))
      const config = sanitizeConfig(row.config, schema.properties)
      const kind = statusKind(schema.properties, config.statusProperty)
      if (!kind || config.actionStatuses.length === 0) {
        return jsonResponse({ ok: true, connected: true, configured: false, databaseId: row.database_id, databaseTitle: schema.title, pages: [] })
      }
      const pages = await queryActionPages(row.token, row.database_id, config, kind)
      return jsonResponse({
        ok: true, connected: true, configured: true, databaseId: row.database_id, databaseTitle: schema.title,
        // 日付の列を選んでいないときは、タスク側で付けた期限を消さない
        datesEnabled: config.dateProperty !== null,
        pages,
      })
    }

    if (action === 'advance') {
      const pageId = (body.pageId as string | undefined)?.replace(/-/g, '')
      const fromStatus = body.fromStatus as string | undefined
      if (!pageId || !/^[0-9a-f]{32}$/i.test(pageId) || !fromStatus) {
        return jsonResponse({ ok: false, error: 'pageId and fromStatus are required' }, 400)
      }
      const schema = readSchema(await notionFetch<DatabaseObject>(row.token, `/databases/${row.database_id}`))
      const config = sanitizeConfig(row.config, schema.properties)
      const kind = statusKind(schema.properties, config.statusProperty)
      const to = config.nextStatus[fromStatus]
      // 要アクションでなくなった（設定を外した・自動で完了した）ステータスは進めない
      if (!kind || !to || !config.actionStatuses.includes(fromStatus)) {
        return jsonResponse({ ok: true, advanced: false })
      }
      const page = await notionFetch<NotionPage>(row.token, `/pages/${pageId}`)
      // Notion 側で既に動いていたら触らない（他の端末から同期された完了でも二重に進まない）
      if (pageStatus(page, config.statusProperty!) !== fromStatus) {
        return jsonResponse({ ok: true, advanced: false })
      }
      await notionFetch(row.token, `/pages/${pageId}`, {
        method: 'PATCH',
        body: JSON.stringify({ properties: { [config.statusProperty!]: { [kind]: { name: to } } } }),
      })
      return jsonResponse({ ok: true, advanced: true, to })
    }

    return jsonResponse({ error: 'Unknown action' }, 400)
  } catch (e) {
    if (e instanceof NotionError) {
      return jsonResponse({ ok: false, code: e.code, error: e.message })
    }
    // DB などの内部のエラーは中身を返さず、サーバーのログにだけ残す
    console.error('[notion]', e)
    return jsonResponse({ ok: false, error: 'Internal error' })
  }
}))
