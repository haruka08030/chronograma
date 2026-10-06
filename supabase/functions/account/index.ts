import { createClient } from 'npm:@supabase/supabase-js@2.103.0'
import { withCors } from '../_shared/cors.ts'
import { BAD_JSON, errorResponse, jsonResponse, readJsonBody } from '../_shared/http.ts'
import { RATE_LIMITS, withinRateLimit } from '../_shared/rateLimit.ts'
import { openSecret, secretContext } from '../_shared/secretBox.ts'
import { decodeJwtPayload, isRecentSignIn, signedInAt } from './reauth.ts'

/**
 * アカウントの削除。利用者が自分でアカウントとクラウドのデータを全部消せるようにする。
 * タスク・リスト・習慣・通知の購読・Google / Notion / Canvas の連携は auth.users の on delete cascade で消える。
 * Google は消す前にトークンを無効にして、Google 側の「アクセスできるアプリ」からも外す。Canvas のトークンも取り消す。
 * auth.admin は service_role が要るので Edge Function で行う。
 * 10 分より前にログインしたセッションからは消さず、403 `reauth_required` を返す（クライアントはログインし直してから送り直す）。
 */

Deno.serve(
  withCors(async (req) => {
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
      const {
        data: { user },
        error: userError,
      } = await userClient.auth.getUser()
      if (userError || !user) return jsonResponse({ ok: false, error: 'Unauthorized' }, 401)

      const body = await readJsonBody(req)
      if (!body) return errorResponse(400, BAD_JSON)
      if (body.action !== 'delete') return jsonResponse({ ok: false, error: 'Unknown action' }, 400)

      const admin = createClient(supabaseUrl, serviceRoleKey)
      if (!(await withinRateLimit(admin, user.id, RATE_LIMITS.account))) {
        return jsonResponse({ ok: false, error: 'Too many requests' }, 429)
      }

      // 最近ログインしたセッションだけ（開いたままの端末・盗まれたトークンですぐには消せないように）
      if (!isRecentSignIn(signedInAt(decodeJwtPayload(authHeader), user.last_sign_in_at))) {
        return jsonResponse({ ok: false, code: 'reauth_required', error: 'reauth_required' }, 403)
      }

      // Google のトークンを無効にする。失敗しても削除は続ける（行は cascade で消え、トークンは使われなくなる）
      const { data: google } = await admin.from('google_oauth').select('refresh_token').eq('user_id', user.id).maybeSingle()
      if (google?.refresh_token) {
        try {
          const token = await openSecret(google.refresh_token as string, secretContext.google(user.id))
          await fetch('https://oauth2.googleapis.com/revoke', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token }),
          })
        } catch (err) {
          console.error('[account] google revoke failed', err)
        }
      }

      // Canvas のアクセストークンも取り消す。学校ごとに並べて投げ、遅い学校があっても削除を待たせない
      const { data: canvasRows } = await admin
        .from('canvas_connection')
        .select('id, base_url, token')
        .eq('user_id', user.id)
        .eq('kind', 'token')
      await Promise.allSettled(
        ((canvasRows ?? []) as { id: string; base_url: string; token: string | null }[]).map(async (r) => {
          // 保存時に確かめた https のドメイン名だけ。それ以外の宛先へはトークンを送らない
          if (!r.token || !/^https:\/\/[a-z0-9.-]+$/i.test(r.base_url)) return
          try {
            const token = await openSecret(r.token, secretContext.canvasToken(user.id, r.id))
            const res = await fetch(`${r.base_url}/login/oauth2/token`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` },
              redirect: 'manual',
              signal: AbortSignal.timeout(5000),
            })
            await res.body?.cancel()
          } catch (err) {
            console.error('[account] canvas revoke failed', err)
          }
        }),
      )

      // 消えた行の印（`008`）は auth.users に外部キーが無い。cascade の中で消えるのは 4 つの表に行があった人の分だけなので、先に消す
      const { error: tombstoneError } = await admin.from('sync_tombstones').delete().eq('user_id', user.id)
      if (tombstoneError) {
        console.error('[account] sync_tombstones delete failed', tombstoneError)
        return jsonResponse({ ok: false, error: 'Failed to delete account' }, 500)
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
  }),
)
