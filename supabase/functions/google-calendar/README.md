# google-calendar Edge Function

Stores Google OAuth refresh tokens and fetches Calendar events server-side.

## Deploy

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
# google_oauth table: supabase/migrations/001_chronograma_schema.sql
supabase secrets set \
  GOOGLE_CLIENT_ID=your_web_oauth_client_id \
  GOOGLE_CLIENT_SECRET=your_web_oauth_client_secret
supabase functions deploy google-calendar
```

Use the **same** Google OAuth Client ID/Secret as Supabase Auth → Google provider.

## Actions (POST JSON + Authorization: Bearer &lt;user jwt&gt;)

| action | body |
|--------|------|
| `status` | `{}` → `{ "connected": true/false, "canWrite": true/false }`（canWrite はつながっているときだけ） |
| `events` | `{ "timeMin": ISO, "timeMax": ISO }` → `{ events, deletedPushed: [{ id, updated }], skipped: [{ …event, skippedAt }], … }`。消された予定も取り、アプリから作った予定（ID が `chronograma` で始まる）の分を `deletedPushed` で返す。ほかの予定で、開始を過ぎてから 7 日以内に消されたものを `skipped`（やらなかった予定）で返す。繰り返しの回は親を読んで題名・長さを補い、繰り返しをまるごと消したときは返さない |
| `disconnect` | `{}` |
| `create` | `{ "fields": { summary, description?, colorId?, start, end } }` |
| `update` | `{ "eventId", "fields" }`（変えるものだけ）。消されていた予定は `google_deleted` |
| `delete` | `{ "eventId" }`（消えている予定も成功） |
| `upsert` | `{ "eventId", "fields", "revive"? }`。ID を決めて、あれば直し、無ければその ID で作る。アプリの予定を Google に送るのに使う。消された予定は `revive: true`（省略も同じ）のときだけ戻し、`revive: false` なら `google_deleted` |

失敗は `{ "ok": false, "error", "code" }`。`code`: `google_not_connected`（連携が無い）・`google_auth_expired`（取り消された・期限切れ）・`google_scope_missing`（許可が足りない）・`google_read_only`（その予定を変える権限が無い）・`google_deleted`（Google で消された予定）・`google_rate_limited`（送りすぎ）・`google_failed`（それ以外）。
