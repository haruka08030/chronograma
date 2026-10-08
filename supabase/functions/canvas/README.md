# canvas Edge Function

Reads the user's Canvas LMS planner (To Do) and returns assignments, quizzes, discussions, pages and planner notes, so the app can turn them into tasks.
When such a task is completed (or reopened) in the app, marks the Canvas To Do item complete (or not) via a planner override.
The access token is stored in `canvas_connection` and never returned to the browser.

## Deploy

The `canvas_connection` table is in `supabase/migrations/001_chronograma_schema.sql` (safe to rerun).

```bash
supabase functions deploy canvas
```

No secrets to set: each user pastes their school's Canvas URL and a personal access token (Account → Settings → New Access Token, max 90 days) in Settings → Canvas.
Several schools can be connected; all their assignments go into one "Canvas" list, each tagged with its course code (`CSE-101`), and connecting turns on tags in To-Do so the course shows on every row. Course sections made by earlier versions are turned into these tags on the next sync. When a token expires, that school's sync fails with `canvas_unauthorized` and Settings shows a field under it to paste a new token (the URL is kept).

## Which hosts it will call

The token is sent only to the school's own origin, so the function refuses internal destinations (`host.ts`):

- `parseBaseUrl` accepts only `https://` domain names: no IPs, ports, user info, or internal names (`localhost`, `.local`, `.internal`, single-label names…).
- Before every request, `assertPublicHost` resolves the name (A / AAAA) and refuses loopback, private, link-local (cloud metadata), CGNAT, multicast and other reserved addresses, including IPv4 written inside IPv6 (`::ffff:`, NAT64, 6to4). Results are cached for 30 seconds only, so pointing the name at an internal address later doesn't slip through for long.
- If the runtime has no `Deno.resolveDns`, no school site is called (`canvas_api`, logged as `Deno.resolveDns is unavailable`).
- Redirects are not followed automatically; a feed follows at most 3 hops, each checked the same way.

## Calendar feed (schools that don't allow tokens)

Some schools (e.g. UC Santa Cruz) disable personal access tokens. Those users paste the Calendar Feed URL instead
(Canvas → Calendar → "Calendar Feed", `https://<school>/feeds/calendars/user_….ics`), stored as `kind = 'ical'` in `feed_url`.
The feed is read-only: `ical.ts` reads assignments (`event-assignment-*`, ids from the `#assignment_<id>` URL fragment so they match the token connection) due from yesterday to 120 days ahead; past assignments are not imported because the feed doesn't say whether they were submitted.
`complete` is a no-op for these connections, and `items` marks them `readOnly`.

## Moodle calendar export

Moodle schools connect the same way (`kind = 'ical'`), with the URL from Calendar → "Export calendar" → "Get calendar URL"
(`https://<school>[/<subpath>]/calendar/export_execute.php?userid=…&authtoken=…`). `feedUrl.ts` decides Canvas vs Moodle from the URL shape
(the settings screen uses the same check) and rewrites a Moodle URL to keep only `userid` / `authtoken` with `preset_what=all&preset_time=recentupcoming`,
so a "this week" export can't make in-window assignments look deleted. `moodle.ts` reads course events (`CATEGORIES` = course short name, used as the tag)
with zero length (`DTEND` equal to `DTSTART` or missing; old Moodle writes them as one-day `VALUE=DATE` events, read as all-day deadlines);
events with a duration (classes), without a course (personal/site events) or titled "… opens" / "… 開始" are skipped. The task id is the Moodle event id from `UID: <id>@<site>`.
UTC times become `dueAt`; times with a non-UTC `TZID` or floating times come back as `dueWall: { date, time, timeZone }` and the app converts them with its time-zone helpers
(a floating time or an unknown `TZID` is read in the app's time zone). `status` returns `lms: 'moodle'` for these connections.

## Keeping the token alive

Canvas lets a user change their own token's expiry without changing the token string (`PUT /api/v1/users/self/tokens/:id`).
On connect, and at most once every 20 hours during `items`, the function finds the token in `GET /api/v1/users/self/user_generated_tokens` (by `token_hint`, the token's first characters) and, if it expires within 60 days, moves the expiry to 89 days from now.
The result is stored in `token_expires_at`. If the school doesn't allow it (or the token can't be found), nothing breaks: Settings shows a warning 14 days before `token_expires_at` with a field to paste a new token.

## Actions (POST JSON + Authorization: Bearer &lt;user jwt&gt;)

One connection per school; `connectionId` is the Canvas hostname (`xxx.instructure.com`).

| action | body | returns |
|--------|------|---------|
| `connect` | `{ "token": "…", "baseUrl": "xxx.instructure.com" }`, `{ "token": "…", "connectionId": "…" }` to replace only that school's token, or `{ "feedUrl": "https://…/feeds/calendars/user_….ics" }` / `{ "feedUrl": "https://…/calendar/export_execute.php?userid=…&authtoken=…" }` | `{ connections }` |
| `status` | `{}` | `{ connections: [{ id, kind, lms, baseUrl, userName, expiresAt }] }` |
| `items` | `{}` | `{ connections: [{ id, windowStart, windowEnd, items: [{ type, id, title, courseId, courseName, url, dueAt, dueDate?, dueWall?, done }] } \| { id, error }] }` — 30 days back to 120 days ahead; a school whose token expired comes back as `{ id, error }` without blocking the others |
| `complete` | `{ "connectionId": "…", "type": "assignment", "id": "123", "complete": true }` | `{ ok: true }` |
| `disconnect` | `{ "connectionId": "…" }` | `{ connections }` |

`done` is true when the item is submitted, excused, graded, or marked complete in Canvas.
Errors come back as `{ ok: false, code, error }` with a non-2xx status (400 for bad input or a malformed JSON body, 401 when not signed in, 429 when rate limited, 502 when the Canvas site rejects or fails, 500 for server errors) with `code` one of `canvas_unauthorized`, `canvas_bad_url`, `canvas_feed_invalid`, `canvas_rate_limited`, `canvas_api`.
Only `https` hostnames are accepted as the Canvas URL, and the token is never sent to any other host (including pagination links).
