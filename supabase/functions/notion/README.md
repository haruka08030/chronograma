# notion Edge Function

Reads one Notion database per user and returns the rows whose status "needs action", so the app can turn them into tasks.
When such a task is completed, moves the row to the configured next status.
The integration secret is stored in `notion_connection` and never returned to the browser.

## Deploy

```bash
supabase db push   # or run 009_notion.sql in SQL Editor
supabase functions deploy notion
```

No secrets to set: each user pastes their own internal integration secret in Settings → Notion.

## Actions (POST JSON + Authorization: Bearer &lt;user jwt&gt;)

| action | body | returns |
|--------|------|---------|
| `connect` | `{ "token": "ntn_…", "database": "<url or id>" }` | schema + config |
| `status` | `{}` | `{ connected: false }` or schema + config |
| `config` | `{ "config": { statusProperty, dateProperty, actionStatuses, nextStatus } }` | schema + config |
| `pages` | `{}` | `{ configured, databaseTitle, datesEnabled, pages: [{ pageId, url, title, status, date }] }` |
| `advance` | `{ "pageId": "…", "fromStatus": "…" }` | `{ advanced }` — only if the row is still in `fromStatus` |
| `disconnect` | `{}` | `{ ok: true }` |

Errors come back as `{ ok: false, code }` with `code` one of `notion_unauthorized`, `notion_not_shared`, `notion_bad_url`, `notion_rate_limited`, `notion_api`.
Pinned to Notion API version `2022-06-28` (database query endpoint).
