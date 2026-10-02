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
Several schools can be connected; all their assignments go into one "Canvas" list, with a section per course. When a token expires, that school's sync fails with `canvas_unauthorized` and Settings shows a field under it to paste a new token (the URL is kept).

## Calendar feed (schools that don't allow tokens)

Some schools (e.g. UC Santa Cruz) disable personal access tokens. Those users paste the Calendar Feed URL instead
(Canvas → Calendar → "Calendar Feed", `https://<school>/feeds/calendars/user_….ics`), stored as `kind = 'ical'` in `feed_url`.
The feed is read-only: `ical.ts` reads assignments (`event-assignment-*`, ids from the `#assignment_<id>` URL fragment so they match the token connection) due from yesterday to 120 days ahead; past assignments are not imported because the feed doesn't say whether they were submitted.
`complete` is a no-op for these connections, and `items` marks them `readOnly`.

## Keeping the token alive

Canvas lets a user change their own token's expiry without changing the token string (`PUT /api/v1/users/self/tokens/:id`).
On connect, and at most once every 20 hours during `items`, the function finds the token in `GET /api/v1/users/self/user_generated_tokens` (by `token_hint`, the token's first characters) and, if it expires within 60 days, moves the expiry to 89 days from now.
The result is stored in `token_expires_at`. If the school doesn't allow it (or the token can't be found), nothing breaks: Settings shows a warning 14 days before `token_expires_at` with a field to paste a new token.

## Actions (POST JSON + Authorization: Bearer &lt;user jwt&gt;)

One connection per school; `connectionId` is the Canvas hostname (`xxx.instructure.com`).

| action | body | returns |
|--------|------|---------|
| `connect` | `{ "token": "…", "baseUrl": "xxx.instructure.com" }`, `{ "token": "…", "connectionId": "…" }` to replace only that school's token, or `{ "feedUrl": "https://…/feeds/calendars/user_….ics" }` | `{ connections }` |
| `status` | `{}` | `{ connections: [{ id, baseUrl, userName }] }` |
| `items` | `{}` | `{ connections: [{ id, windowStart, windowEnd, items: [{ type, id, title, courseId, courseName, url, dueAt, done }] } \| { id, error }] }` — 30 days back to 120 days ahead; a school whose token expired comes back as `{ id, error }` without blocking the others |
| `complete` | `{ "connectionId": "…", "type": "assignment", "id": "123", "complete": true }` | `{ ok: true }` |
| `disconnect` | `{ "connectionId": "…" }` | `{ connections }` |

`done` is true when the item is submitted, excused, graded, or marked complete in Canvas.
Errors come back as `{ ok: false, code }` with `code` one of `canvas_unauthorized`, `canvas_bad_url`, `canvas_feed_invalid`, `canvas_rate_limited`, `canvas_api`.
Only `https` hostnames are accepted as the Canvas URL, and the token is never sent to any other host (including pagination links).
