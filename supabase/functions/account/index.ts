import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

/**
 * アカウントの削除。利用者が自分でアカウントとクラウドのデータを全部消せるようにする。
 * タスク・リスト・習慣・通知の購読・Google / Notion の連携は auth.users の on delete cascade で消える。
 * Google は消す前にトークンを無効にして、Google 側の「アクセスできるアプリ」からも外す。
 * auth.admin は service_role が要るので Edge Function で行う。
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
      return jsonResponse({ ok: false, error: 'Server misconfigured' }, 500)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ ok: false, error: 'Missing Authorization header' }, 401)

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) return jsonResponse({ ok: false, error: 'Unauthorized' }, 401)

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    if (body.action !== 'delete') return jsonResponse({ ok: false, error: 'Unknown action' }, 400)

    const admin = createClient(supabaseUrl, serviceRoleKey)

    // Google のトークンを無効にする。失敗しても削除は続ける（行は cascade で消え、トークンは使われなくなる）
    const { data: google } = await admin
      .from('google_oauth')
      .select('refresh_token')
      .eq('user_id', user.id)
      .maybeSingle()
    if (google?.refresh_token) {
      try {
        await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: google.refresh_token as string }),
        })
      } catch (err) {
        console.error('[account] google revoke failed', err)
      }
    }

    const { error } = await admin.auth.admin.deleteUser(user.id)
    if (error) {
      console.error('[account] deleteUser failed', error)
      return jsonResponse({ ok: false, error: 'Failed to delete account' }, 500)
    }
    return jsonResponse({ ok: true })
  } catch (err) {
    console.error('[account]', err)
    return jsonResponse({ ok: false, error: 'Failed to delete account' }, 500)
  }
})
