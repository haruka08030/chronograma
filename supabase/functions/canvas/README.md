# canvas Edge Function

Reads the user's Canvas LMS planner (To Do) and returns assignments, quizzes, discussions, pages and planner notes, so the app can turn them into tasks.
When such a task is completed (or reopened) in the app, marks the Canvas To Do item complete (or not) via a planner override.
The access token is stored in `canvas_connection` and never returned to the browser.

## Deploy

The `canvas_connection` table is in `supabase/migrations/001_chronograma_schema.sql` (existing DBs: `003_canvas.sql`, safe to rerun).

```bash
supabase functions deploy canvas
```

No secrets to set: each user pastes their school's Canvas URL and a personal access token (Account → Settings → New Access Token, max 90 days) in Settings → Canvas.
Several schools can be connected; each gets its own list. When a token expires, that school's sync fails with `canvas_unauthorized` and Settings shows a field under it to paste a new token (the URL is kept).

## Actions (POST JSON + Authorization: Bearer &lt;user jwt&gt;)

One connection per school; `connectionId` is the Canvas hostname (`xxx.instructure.com`).

| action | body | returns |
|--------|------|---------|
| `connect` | `{ "token": "…", "baseUrl": "xxx.instructure.com" }`, or `{ "token": "…", "connectionId": "…" }` to replace only that school's token | `{ connections }` |
| `status` | `{}` | `{ connections: [{ id, baseUrl, userName }] }` |
| `items` | `{}` | `{ connections: [{ id, windowStart, windowEnd, items: [{ type, id, title, courseId, courseName, url, dueAt, done }] } \| { id, error }] }` — 30 days back to 120 days ahead; a school whose token expired comes back as `{ id, error }` without blocking the others |
| `complete` | `{ "connectionId": "…", "type": "assignment", "id": "123", "complete": true }` | `{ ok: true }` |
| `disconnect` | `{ "connectionId": "…" }` | `{ connections }` |

`done` is true when the item is submitted, excused, graded, or marked complete in Canvas.
Errors come back as `{ ok: false, code }` with `code` one of `canvas_unauthorized`, `canvas_bad_url`, `canvas_rate_limited`, `canvas_api`.
Only `https` hostnames are accepted as the Canvas URL, and the token is never sent to any other host (including pagination links).
